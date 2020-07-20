
import Decimal from 'decimal.js'

import { blockChainStatus, transaction, blockHeader } from './const'
import { taskDispatcher, task } from './taskDispatcher'
import { networkManager } from './networkManager'
import { databaseManager } from './databaseManager'

export class blockChainService {
    private _db = new databaseManager('./test-db')
    private _net = new networkManager()
    private _td = new taskDispatcher()
    private _status: blockChainStatus

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
        this._td.registerHandler("preDownloadBlockHeader",
            async (td: taskDispatcher, t: task) => {
                let newHeight = new Decimal(this._status.currentBlockHeader.height).add(1).toString()
                let bh = await this._net.downloadHeader(newHeight)
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

        this._td.registerHandler("preDownloadBlockHeader(forward)",
            async (td: taskDispatcher, t: task) => {
                let bh = await this._net.downloadHeader(this._status.currentBlockHeader.height)
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
                let newHeight = new Decimal(this._status.currentBlockHeader.height).add(1).toString()
                let bh = await this._db.getBlockByHeight(newHeight)
                this._status.currentBlockHeader = bh
                this._status.currentTransactions = []
            }
        )

        this._td.registerHandler("preDownloadTransactions",
            async (td: taskDispatcher, t: task) => {
                let txs: transaction[] = []
                for (let txHash of this._status.currentBlockHeader.transactionHashs) {
                    txs.push(await this._net.downloadTransaction(txHash))
                }
                this._status.currentTransactions = txs

                return {
                    name: "checkTransactions"
                }
            },
            async (td: taskDispatcher, t: task) => {
                this._status.currentTransactions = []
            }
        )

        this._td.registerHandler("checkTransactions",
            async (td: taskDispatcher, t: task) => {
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
                for (let transaction of this._status.currentTransactions) {
                    this._updateUserBalance(transaction.to, `-${transaction.value}`)
                    this._updateUserBalance(transaction.from, transaction.value)
                }
            }
        )

        this._td.registerHandler("checkBlockHeader",
            async (td: taskDispatcher, t: task) => {
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
                await this._persistStatus()

                // 没有达到最大高度, 继续同步.
                if (!flag) {
                    this.startSync()
                }
                return {
                    commit: true
                }
            },
            async (td: taskDispatcher, t: task) => {
                this._updateUserBalance(this._status.currentBlockHeader.miner, -2)
                await this._deleteStatus()
            }
        )
    }

    private async _persistStatus() {
        await this._db.putStatus(this._status)
        await this._db.putBlock(this._status.currentBlockHeader)
        await Promise.all(this._db.putTransactions(this._status.currentTransactions))
    }

    private async _deleteStatus() {
        await this._db.delStatus(this._status)
        await this._db.delBlock(this._status.currentBlockHeader)
        await Promise.all(this._db.delTransactions(this._status.currentTransactions))
    }

    makeGenesisBlock() {
        let block: blockHeader = {
            hash: "000",
            preHash: "000",
            miner: "123456",
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

    async init() {
        let [block, tx] = this.makeGenesisBlock()

        this._status = {
            userBalance: new Map<string, string>(),
            maxHeight: "0",
            currentBlockHeader: block as blockHeader,
            currentTransactions: []
        }
        this._status.currentTransactions.push(tx as transaction)
        
        await this._persistStatus()
    }

    // 开始同步.
    async startSync() {
        await this._td.transaction()
        let blockHeight = new Decimal(this._status.currentBlockHeader.height)
        let localMaxHeight = new Decimal(this._status.maxHeight)
        if (localMaxHeight.greaterThan(blockHeight)) {
            await this._td.newTask("preDownloadBlockHeader", true)
        }
    }

    // 接受到最新区块通知.
    async onNewBlock(block: blockHeader) {
        let blockHeight = new Decimal(block.height)
        let localMaxHeight = new Decimal(this._status.maxHeight)
        if (blockHeight.greaterThan(localMaxHeight)) {
            await this._td.transaction()
            blockHeight = new Decimal(block.height)
            localMaxHeight = new Decimal(this._status.maxHeight)
            if (blockHeight.greaterThan(localMaxHeight)) {
                this._status.maxHeight = block.height
                await this._td.newTask("preDownloadBlockHeader", true)
            }
        }
    }
}