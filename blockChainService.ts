
import Decimal from 'decimal.js'

import { blockChainStatus, transaction, blockHeader } from './const'
import { taskDispatcher, task } from './taskDispatcher'
import { fakeNetworkService } from './fakeNetworkService'
import { databaseService } from './databaseService'

export function printBlockChainStatus(status: blockChainStatus) {
    console.log("userBalance:")
    for (let key of status.userBalance.keys()) {
        console.log(`   ${key} => ${status.userBalance.get(key)}`)
    }
    console.log(`syncMode: ${status.syncMode}`)
    console.log(`maxHeight: ${status.maxHeight}`)
    console.log(`currentBlockHeader: ${JSON.stringify(status.currentBlockHeader)}`)
    console.log(`currentTransactions: ${JSON.stringify(status.currentTransactions)}`)
    console.log("------------------------------")
}

export class blockChainService {
    /*private*/ _db = new databaseService('./test-db')
    /*private*/ _net = new fakeNetworkService('./fake-network-db')
    /*private*/ _td = new taskDispatcher()
    /*private*/ _status: blockChainStatus

    private _updateUserBalance(address: string, value: Decimal | number | string): boolean {
        let dvalue = value instanceof Decimal ? value : new Decimal(value)
        let balance = this._status.userBalance.has(address) ? new Decimal(this._status.userBalance.get(address)) : new Decimal(0)
        let newBalance = balance.add(dvalue)
        if (newBalance.lessThan(0)) {
            return false
        }
        this._status.userBalance.set(address, newBalance.toString())
        return true
    }

    private _checkUserBalance(address: string, value: Decimal | number | string, flag: 0 | 1 | 2 | 3 = 0): boolean {
        let dvalue = value instanceof Decimal ? value : new Decimal(value)
        let balance = this._status.userBalance.has(address) ? new Decimal(this._status.userBalance.get(address)) : new Decimal(0)
        if (flag === 0) {
            return balance.greaterThanOrEqualTo(dvalue)
        }
        else if (flag === 1) {
            return balance.greaterThan(dvalue)
        }
        else if (flag === 2) {
            return balance.lessThanOrEqualTo(dvalue)
        }
        else {
            return balance.lessThan(dvalue)
        }
    }

    constructor() {
        // 预下载区块头.
        this._td.registerHandler("preDownloadBlockHeader",
            async (td: taskDispatcher, t: task) => {
                console.log("- start preDownloadBlockHeader")
                let newHeight = new Decimal(this._status.currentBlockHeader.height).add(1).toString()
                let bh = await this._net.downloadHeader(newHeight)
                if (!bh) {
                    throw new Error("dowload block failed!")
                }
                if (bh.height === newHeight &&
                    bh.preHash === this._status.currentBlockHeader.hash) {
                    // 记录新块头, 清除事务. 
                    this._status.currentBlockHeader = bh
                    this._status.currentTransactions = []
                    return {
                        name: "preDownloadTransactions"
                    }
                }
                else {
                    return {
                        name: "preDownloadBlockHeader(forward)"
                    }
                }
            },
            async (td: taskDispatcher, t: task) => {
                console.log("- start rollback preDownloadBlockHeader")
                let height = new Decimal(this._status.currentBlockHeader.height)
                let blockHeader: blockHeader
                if (height.equals(0)) {
                    blockHeader = this.makeGenesisBlock()[0] as blockHeader
                }
                else {
                    blockHeader = await this._db.getBlockByHeight(height.sub(1).toString())
                }
                if (!blockHeader) {
                    throw new Error("missing block!")
                }
                this._status.currentBlockHeader = blockHeader
            }
        )

        // 预下载区块头(向前回滚).
        this._td.registerHandler("preDownloadBlockHeader(forward)",
            async (td: taskDispatcher, t: task) => {
                console.log("- start preDownloadBlockHeader(forward)")
                let bh = await this._net.downloadHeader(this._status.currentBlockHeader.height)
                if (!bh) {
                    throw new Error("dowload block failed!")
                }
                if (bh.height === this._status.currentBlockHeader.height &&
                    bh.hash === this._status.currentBlockHeader.hash) {
                    // 找到同步点, 开始向后同步. 
                    return {
                        name: "preDownloadBlockHeader"
                    }
                }
                else {
                    let height = new Decimal(this._status.currentBlockHeader.height)
                    let blockHeader: blockHeader
                    if (height.equals(0)) {
                        throw new Error("genesis block not match!")
                    }
                    else {
                        blockHeader = await this._db.getBlockByHeight(height.sub(1).toString())
                    }
                    if (!blockHeader) {
                        throw new Error("missing block!")
                    }
                    this._status.currentBlockHeader = blockHeader
                    return {
                        name: "preDownloadBlockHeader(forward)"
                    }
                }
            },
            async (td: taskDispatcher, t: task) => {
                console.log("- start rollback preDownloadBlockHeader(forward)")
                let newHeight = new Decimal(this._status.currentBlockHeader.height).add(1).toString()
                let bh = await this._db.getBlockByHeight(newHeight)
                this._status.currentBlockHeader = bh
                this._status.currentTransactions = []
            }
        )

        // 预下载交易.
        this._td.registerHandler("preDownloadTransactions",
            async (td: taskDispatcher, t: task) => {
                console.log("- start preDownloadTransactions")
                let txs: transaction[] = []
                for (let txHash of this._status.currentBlockHeader.transactionHashs) {
                    let tx = await this._net.downloadTransaction(txHash)
                    if (!tx) {
                        throw new Error("dowload tx failed!")
                    }
                    txs.push(tx)
                }
                this._status.currentTransactions = txs

                return {
                    name: "checkTransactions"
                }
            },
            async (td: taskDispatcher, t: task) => {
                console.log("- start rollback preDownloadTransactions")
                this._status.currentTransactions = []
            }
        )

        // 校验交易.
        this._td.registerHandler("checkTransactions",
            async (td: taskDispatcher, t: task) => {
                console.log("- start checkTransactions")
                for (let transaction of this._status.currentTransactions) {
                    if (!this._checkUserBalance(transaction.from, transaction.value)) {
                        throw new Error("check transaction failed!")
                    }
                }

                for (let transaction of this._status.currentTransactions) {
                    this._updateUserBalance(transaction.from, `-${transaction.value}`)
                    this._updateUserBalance(transaction.to, transaction.value)
                }

                return {
                    name: "checkBlockHeader"
                }
            },
            async (td: taskDispatcher, t: task) => {
                console.log("- start rollback checkTransactions")
                for (let transaction of this._status.currentTransactions) {
                    this._updateUserBalance(transaction.to, `-${transaction.value}`)
                    this._updateUserBalance(transaction.from, transaction.value)
                }
            }
        )

        // 校验块头.
        this._td.registerHandler("checkBlockHeader",
            async (td: taskDispatcher, t: task) => {
                console.log("- start checkBlockHeader")

                // 发放矿工工资.
                this._updateUserBalance(this._status.currentBlockHeader.miner, 2)
                // 判断是否到达最大高度.
                let blockHeight = new Decimal(this._status.currentBlockHeader.height)
                let localMaxHeight = new Decimal(this._status.maxHeight)
                let flag = blockHeight.greaterThanOrEqualTo(localMaxHeight)
                if (flag) {
                    this._status.maxHeight = this._status.currentBlockHeader.height
                }

                // 持久化最新的块及状态信息.
                await this._persistBlockChain()

                // only for debug.
                printBlockChainStatus(this._status)

                // 没有达到最大高度, 继续同步.
                if (!flag) {
                    this._status.syncMode === "network" ? this.startSync() : this.startRebuild()
                }
                return {
                    commit: true
                }
            },
            async (td: taskDispatcher, t: task) => {
                console.log("- start rollback checkBlockHeader")
                this._updateUserBalance(this._status.currentBlockHeader.miner, -2)
                if (this._status.syncMode === "network") {
                    await this._deleteBlockChain()
                }
            }
        )

        // 预加载区块头.
        this._td.registerHandler("preLoadBlockHeader",
            async (td: taskDispatcher, t: task) => {
                console.log("- start preLoadBlockHeader")
                let newHeight = new Decimal(this._status.currentBlockHeader.height).add(1).toString()
                let block = await this._db.getBlockByHeight(newHeight)
                if (!block) {
                    throw new Error(`missing block in ${newHeight}`)
                }
                if (block.height === newHeight &&
                    block.preHash === this._status.currentBlockHeader.hash) {
                    this._status.currentBlockHeader = block
                    this._status.currentTransactions = []
    
                    return {
                        name: "preLoadTransactions"
                    }
                }
                else {
                    throw new Error(`wrong block info in height ${newHeight}`)
                }
            },
            async (td: taskDispatcher, t: task) => {
                console.log("- start rollback preLoadBlockHeader")
                let height = new Decimal(this._status.currentBlockHeader.height)
                let blockHeader: blockHeader
                if (height.equals(0)) {
                    blockHeader = this.makeGenesisBlock()[0] as blockHeader
                }
                else {
                    blockHeader = await this._db.getBlockByHeight(height.sub(1).toString())
                }
                if (!blockHeader) {
                    throw new Error("missing block!")
                }
                this._status.currentBlockHeader = blockHeader
                this._status.currentTransactions = []
            }
        )

        // 预先加载交易.
        this._td.registerHandler("preLoadTransactions",
            async (td: taskDispatcher, t: task) => {
                console.log("- start preLoadTransactions")
                let txs: transaction[] = []
                for (let txHash of this._status.currentBlockHeader.transactionHashs) {
                    txs.push(await this._db.getTransactionByHash(txHash))
                }
                this._status.currentTransactions = txs

                return {
                    name: "checkTransactions"
                }
            },
            async (td: taskDispatcher, t: task) => {
                console.log("- start rollback preLoadTransactions")
                this._status.currentTransactions = []
            }
        )
    }

    private async _persistBlockChain() {
        await this._db.putBlock(this._status.currentBlockHeader, this._status.syncMode === "network")
        await Promise.all(this._db.putTransactions(this._status.currentTransactions))
    }

    private async _deleteBlockChain() {
        await this._db.delBlock(this._status.currentBlockHeader, this._status.syncMode === "network")
        await Promise.all(this._db.delTransactions(this._status.currentTransactions))
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
            maxHeight: "0",
            currentBlockHeader: block as blockHeader,
            currentTransactions: []
        }
        this._status.currentTransactions.push(tx as transaction)
        this._status.userBalance.set((tx as transaction).to, (tx as transaction).value)
        
        await this._persistBlockChain()
    }

    // 开始从本地重建区块.
    async startRebuild() {
        let latestBlock = await this._db.getLatestBlock()
        if (!latestBlock) {
            return
        }
        let blockHeight = new Decimal(this._status.currentBlockHeader.height)
        let latestBlockHeight = new Decimal(latestBlock.height)
        if (latestBlockHeight.greaterThan(blockHeight)) {
            await this._td.transaction()
            this._status.syncMode = "database"
            blockHeight = new Decimal(this._status.currentBlockHeader.height)
            latestBlock = await this._db.getLatestBlock()
            if (!latestBlock) {
                await this._td.rollback()
                return
            }
            latestBlockHeight = new Decimal(latestBlock.height)
            if (latestBlockHeight.greaterThan(blockHeight)) {
                this._status.maxHeight = latestBlock.height
                await this._td.newTask("preLoadBlockHeader", true)
            }
            else {
                await this._td.rollback()
            }
        }
    }

    // 开始从网络同步.
    async startSync() {
        let blockHeight = new Decimal(this._status.currentBlockHeader.height)
        let localMaxHeight = new Decimal(this._status.maxHeight)
        if (localMaxHeight.greaterThan(blockHeight)) {
            await this._td.transaction()
            this._status.syncMode = "network"
            blockHeight = new Decimal(this._status.currentBlockHeader.height)
            localMaxHeight = new Decimal(this._status.maxHeight)
            if (localMaxHeight.greaterThan(blockHeight)) {
                await this._td.newTask("preDownloadBlockHeader", true)
            }
            else {
                await this._td.rollback()
            }
        }
    }

    // 接受到最新区块通知.
    async onNewBlock(block: blockHeader) {
        let blockHeight = new Decimal(block.height)
        let localMaxHeight = new Decimal(this._status.maxHeight)
        if (blockHeight.greaterThan(localMaxHeight)) {
            await this._td.transaction()
            this._status.syncMode = "network"
            localMaxHeight = new Decimal(this._status.maxHeight)
            if (blockHeight.greaterThan(localMaxHeight)) {
                this._status.maxHeight = block.height
                await this._td.newTask("preDownloadBlockHeader", true)
            }
            else {
                await this._td.rollback()
            }
        }
    }
}