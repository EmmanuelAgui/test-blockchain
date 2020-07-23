
import Decimal from 'decimal.js'

import { blockChainStatus, transaction, blockHeader, syncInfo } from './@types'
import { taskDispatcher } from './taskDispatcher'
import { fakeNetworkService } from './fakeNetworkService'
import { databaseService, databaseOperator } from './databaseService'
import { aborter } from './aborter'

export function printBlockChain(status: blockChainStatus, info: syncInfo) {
    console.log("userBalance:")
    for (let key of status.userBalance.keys()) {
        console.log(`   ${key} => ${status.userBalance.get(key)}`)
    }
    console.log(`currentBlockHeader: ${JSON.stringify(status.currentBlockHeader)}`)
    console.log(`currentTransactions: ${JSON.stringify(status.currentTransactions)}`)
    console.log(`syncMode: ${info.syncMode}`)
    console.log(`peerInfo: ${info.peerInfo}`)
    console.log(`maxHeight: ${info.maxHeight}`)
    console.log(`maxHeightBlockHash: ${info.maxHeightBlockHash}`)
    console.log("------------------------------")
}

// 更新用户余额.
function updateUserBalance(userBalance: Map<string, string>, address: string, value: Decimal | number | string): boolean {
    let dvalue = value instanceof Decimal ? value : new Decimal(value)
    let balance = userBalance.has(address) ? new Decimal(userBalance.get(address)) : new Decimal(0)
    let newBalance = balance.add(dvalue)
    if (newBalance.lessThan(0)) {
        return false
    }
    userBalance.set(address, newBalance.toString())
    return true
}

export class blockChainService {
    /*private*/ _db = new databaseService('./test-db')
    /*private*/ _net = new fakeNetworkService('./fake-network-db')
    /*private*/ _td = new taskDispatcher<any>()
    /*private*/ _status: blockChainStatus
    /*private*/ _syncInfo: syncInfo
    private _blockInfoCache = new Map<string, Promise<unknown>>()

    /*private*/ _ab = new aborter()
    private _lockResolved: boolean = true
    private _lockPromise: Promise<void>
    private _lockResolve: () => void

    private _isSyncFromNetwork(): boolean {
        return this._syncInfo.syncMode === "network"
    }

    constructor() {
    
        this._td.registerTaskProcessor("syncBlock", async (status: blockChainStatus, dbopts: databaseOperator[]) => {            
            let bh: blockHeader
            try {
                bh = await this._ab.abortablePromise(this._td.processTask("rollback", status, dbopts))
            }
            catch(err) {
                console.log(`syncBlock catch error: ${err}`)
                this._ab.abort()
                return
            }
            
            let maxHeight = new Decimal(this._syncInfo.maxHeight)
            for (let height = new Decimal(bh.height); height.lessThanOrEqualTo(maxHeight); height = height.add(1)) {

                let blockPromise = height.equals(new Decimal(bh.height)) ?
                    Promise.resolve(bh) :
                    this._td.processTask("preDownloadBlockHeader", height.toString())

                let p = new Promise((resolve, reject) => {
                    blockPromise.then(block => {
                        this._td.processTask("preDownloadTransactions", block).then(transactions => {
                            this._td.processTask("checkBlockAndTransactions", status, dbopts, block, transactions, resolve).catch(err => reject(err))
                        }, err => reject(err))
                    }, err => reject(err))
                }).catch(err => {
                    console.log(`syncBlock catch error: ${err}`)
                    this._ab.abort()
                })

                this._blockInfoCache.set(height.toString(), p)
            }
        });

        this._td.registerTaskProcessor("rollback", async (status: blockChainStatus, dbopts: databaseOperator[]) => {
            let findForkPoint = async () => {
                let newHeight = new Decimal(status.currentBlockHeader.height).add(1).toString()
                let bh = await this._ab.abortablePromise(this._isSyncFromNetwork() ? this._net.downloadHeader(newHeight) : this._db.getBlockByHeight(newHeight))
                if (!bh) {
                    throw new Error("dowload block failed!")
                }
                if (bh.height === newHeight &&
                    bh.preHash === status.currentBlockHeader.hash) {
                    return bh
                }
            }
            
            let bh: blockHeader = await this._ab.abortablePromise(findForkPoint())
            while (!bh) {
                let currentHeight = new Decimal(status.currentBlockHeader.height)
                if (currentHeight.equals(0)) {
                    throw new Error("genesis block not match!")
                }

                dbopts = dbopts.concat(this._db.makeDelTransactionsOperators(
                    await this._ab.abortablePromise(
                        Promise.all(status.currentBlockHeader.transactionHashs.map(txHash => {
                            return this._db.getTransactionByHash(txHash)
                })))))
                dbopts = dbopts.concat(this._db.makeDelBlockOperators(status.currentBlockHeader))

                let lastHeight = currentHeight.sub(1)
                status.currentBlockHeader = await this._ab.abortablePromise(this._db.getBlockByHeight(lastHeight.toString()))
                if (!status.currentBlockHeader) {
                    throw new Error("missing block!")
                }

                bh = await this._ab.abortablePromise(findForkPoint())
            }
            return bh
        })

        this._td.registerTaskProcessor("preDownloadBlockHeader", async (height: string) => {
            return await this._ab.abortablePromise(this._isSyncFromNetwork() ? this._net.downloadHeader(height) : this._db.getBlockByHeight(height))
        })

        this._td.registerTaskProcessor("preDownloadTransactions", async (block: blockHeader) => {
            return await this._ab.abortablePromise(Promise.all(
                this._isSyncFromNetwork() ?
                block.transactionHashs.map(hash => this._net.downloadTransaction(hash)) :
                block.transactionHashs.map(hash => this._db.getTransactionByHash(hash))))
        })

        this._td.registerTaskProcessor("checkBlockAndTransactions",
            async (status: blockChainStatus, dbopts: databaseOperator[], block: blockHeader, transactions: transaction[], resolve: () => void) => {
                let height = new Decimal(block.height)
                if (height.greaterThan(1)) {
                    // 等待上一个块完成处理.
                    await this._ab.abortablePromise(this._blockInfoCache.get(height.sub(1).toString()))
                    if (status.currentBlockHeader.hash !== block.preHash) {
                        throw new Error(`preHash not match! height: ${status.currentBlockHeader.height} ${block.height}`)
                    }
                }
                else {
                    if (block.preHash !== (this.makeGenesisBlock()[0] as blockHeader).hash) {
                        throw new Error(`preHash not match to genesis block! ${block.height}`)
                    }
                }

                // 设置为当前区块信息.
                status.currentBlockHeader = block
                status.currentTransactions = transactions

                // 更新用户余额.
                updateUserBalance(status.userBalance, status.currentBlockHeader.miner, 2)
                for (let transaction of transactions) {
                    if (!updateUserBalance(status.userBalance, transaction.from, `-${transaction.value}`)) {
                        throw new Error(`check transaction failed! ${transaction.hash}`)
                    }
                    updateUserBalance(status.userBalance, transaction.to, transaction.value)
                }

                // 生成数据库操作记录.
                dbopts = dbopts.concat(this._db.makePutBlockOperators(status.currentBlockHeader))
                dbopts = dbopts.concat(this._db.makeUpdateLatestBlockOperator(status.currentBlockHeader))
                dbopts = dbopts.concat(this._db.makePutTransactionsOperators(status.currentTransactions))

                // only for debug.
                printBlockChain(status, this._syncInfo)

                resolve()
        })
    }

    // 获取创世块.
    makeGenesisBlock() {
        let block: blockHeader = {
            hash: "000",
            preHash: "000",
            miner: "000",
            height: "0",
            diff: "000",
            nonce: "000",
            transactionHashs: []
        }
        let tx: transaction = {
            hash: "000",
            from: "000",
            to: "123456",
            value: "100000000000000",
            nonce: "000",
            signature: "000"
        }
        block.transactionHashs.push(tx.hash)
        return [block, tx]
    }

    start() {
        return this._td.start()
    }

    async init() {
        await this._db.open()
        await this._net.open()

        let [block, tx] = this.makeGenesisBlock()
        this._status = {
            userBalance: new Map<string, string>(),
            currentBlockHeader: block as blockHeader,
            currentTransactions: []
        }
        this._status.currentTransactions.push(tx as transaction)
        this._status.userBalance.set((tx as transaction).to, (tx as transaction).value)

        this._syncInfo = {
            syncMode: "database",
            maxHeight: (block as blockHeader).height,
            maxHeightBlockHash: block.hash,
            peerInfo: ""
        }
    }

    private async _lock() {
        while(!this._lockResolved) {
            await this._lockPromise
        }
        this._lockResolved = false
        this._lockPromise = new Promise((resolve) => this._lockResolve = resolve)
    }

    private _unlock() {
        this._lockResolved = true
        this._lockResolve()
    }

    private _copyStatus(): blockChainStatus {
        let b: blockHeader = {
            hash: undefined,
            preHash: undefined,
            miner: undefined,
            height: undefined,
            diff: undefined,
            nonce: undefined,
            transactionHashs: undefined
        }
        for (let key in this._status.currentBlockHeader) {
            b[key] = this._status.currentBlockHeader[key]
        }

        let txs: transaction[] = []
        for (let transaction of this._status.currentTransactions) {
            let tx: transaction = {
                hash: undefined,
                from: undefined,
                to: undefined,
                value: undefined,
                nonce: undefined,
                signature: undefined
            }
            for (let key in transaction) {
                tx[key] = transaction[key]
            }
            txs.push(tx)
        }

        let ub = new Map<string, string>()
        for (let key of this._status.userBalance.keys()) {
            ub.set(key, this._status.userBalance.get(key))
        }

        return {
            currentBlockHeader: b,
            currentTransactions: txs,
            userBalance: ub
        }
    }

    async startRebuild() {
        await this._lock()
        let latestBlock = await this._db.getLatestBlock()
        if (!latestBlock) {
            this._unlock()
            return
        }
        this._syncInfo.maxHeight = latestBlock.height
        this._syncInfo.maxHeightBlockHash = latestBlock.hash
        this._syncInfo.syncMode = "database"
        this._ab.reset()

        let status = this._copyStatus()
        let dbopts: databaseOperator[] = []
        await this._td.processTask("syncBlock", status, dbopts)
        await Promise.all(this._blockInfoCache.values())
        this._blockInfoCache.clear()
        if (!this._ab.isAborted()) {
            this._status = status
            await this._db.batch(dbopts)
        }
        else {
            this._syncInfo.maxHeight = this._status.currentBlockHeader.height
            this._syncInfo.maxHeightBlockHash = this._status.currentBlockHeader.hash
        }
        this._unlock()
    }
}