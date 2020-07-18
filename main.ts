import WebSocket from 'ws'

import { wsClient } from './wsClient'

const args = process.argv.splice(2)

const wsClients: wsClient[] = []
for (let address of args) {
    wsClients.push(new wsClient(address))
}

const wsServer = new WebSocket.Server({
        port: 8080,
        perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages
        // should not be compressed.
    }
})

wsServer.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
    });

    ws.send('something');
});

wsServer.on('close', function close(ws) {
    console.log("wsServer close")
})

wsServer.on('error', function close(ws) {
    console.log("wsServer error")
})

import Decimal from 'decimal.js'

import { database } from './database'
import { taskDispatcher, task } from './taskDispatcher'

type blockChainStatus = {
    userBalance: Map<string, string>

    maxHeight: string
    currentBlockHeader: blockHeader
    currentTransactions: transaction[]
}

type transaction = {
    hash: string
    from: string
    to: string
    value: string
    nonce: string
    signature: string
}

type blockHeader = {
    hash: string,
    preHash: string,
    miner: string,
    height: string,
    diff: string,
    nonce: string,
    transactionHashs: string[]
}

class databaseManager extends database {
    constructor(path: string) { super(path) }

    async getBlockByHeight(height: string): Promise<blockHeader> { return undefined }

    async putStatus(status: blockChainStatus): Promise<void> {}
    async putBlock(blockHeader: blockHeader): Promise<void> {}
    putTransactions(transactions: transaction[]): Promise<void>[] { return [] }

    async delStatus(status: blockChainStatus): Promise<void> {}
    async delBlock(blockHeader: blockHeader): Promise<void> {}
    delTransactions(transactions: transaction[]): Promise<void>[] { return [] }
}

class networkManager {
    async downloadHeader(height: string): Promise<blockHeader> { return undefined }
    async downloadTransaction(hash: string): Promise<transaction> { return undefined }
}

class blockChainService {
    private _db = new databaseManager('./db')
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
                    // 回滚...
                }
            },
            async (td: taskDispatcher, t: task) => {
                let height = new Decimal(this._status.currentBlockHeader.height)
                let blockHeader: blockHeader
                if (height.equals(0)) {
                    // 创世块...
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
                    (async () => {
                        await this._td.transaction()
                        await this._td.newTask("preDownloadBlockHeader", true)
                    })()
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

    async init() {
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

        this._status = {
            userBalance: new Map<string, string>(),
            maxHeight: "0",
            currentBlockHeader: block,
            currentTransactions: []
        }
        this._status.currentTransactions.push(tx)
        
        await this._persistStatus()
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