import { database } from './database'
import { blockChainStatus, transaction, blockHeader } from './const'
import Decimal from 'decimal.js'

/*
export function txFromJson(data: any): transaction {
    let json = JSON.parse(data)
    let tx: transaction = {
        hash: json.hash,
        from: json.from,
        to: json.to,
        value: json.value,
        nonce: json.nonce,
        signature: json.signature,
        blockHash: json.blockHash
    }
    return tx
}

export function bhFromJson(data: any): blockHeader {
    let json = JSON.parse(data)
    let bh: blockHeader = {
        hash: json.hash,
        preHash: json.preHash,
        miner: json.miner,
        height: json.height,
        diff: json.diff,
        nonce: json.nonce,
        transactionHashs: json.transactionHashs
    }
    return bh
}
*/

function formatTransactionRecord(tx: transaction): Map<string, string> {
    let map = new Map<string, string>()
    map.set(`${tx.hash}:from`, tx.from)
    map.set(`${tx.hash}:to`, tx.to)
    map.set(`${tx.hash}:value`, tx.value)
    map.set(`${tx.hash}:nonce`, tx.nonce)
    map.set(`${tx.hash}:signature`, tx.signature)
    map.set(`${tx.hash}:blockHash`, tx.blockHash ? tx.blockHash : "unknow")
    return map
}

function formatBlockHeaderRecord(bh: blockHeader): Map<string, string> {
    let map = new Map<string, string>()
    map.set(`${bh.hash}:preHash`, bh.preHash)
    map.set(`${bh.hash}:miner`, bh.miner)
    map.set(`${bh.hash}:height`, bh.height)
    map.set(`${bh.hash}:diff`, bh.diff)
    map.set(`${bh.hash}:nonce`, bh.nonce)
    map.set(`${bh.hash}:transactionCount`, String(bh.transactionHashs.length))
    map.set(`height:${bh.height}`, bh.hash)

    for (let i = 0; i < bh.transactionHashs.length; i++) {
        map.set(`${bh.hash}:tx:${i}`, bh.transactionHashs[i])
    }
    return map
}

export class databaseManager extends database {
    constructor(path: string) { super(path) }

    async getTransactionByHash(hash: string): Promise<transaction> {
        if (!hash) {
            return undefined
        }

        let transaction: transaction = {
            hash,
            from: await this.get(`${hash}:from`),
            to: await this.get(`${hash}:to`),
            value: await this.get(`${hash}:value`),
            nonce: await this.get(`${hash}:nonce`),
            signature: await this.get(`${hash}:signature`),
            blockHash: await this.get(`${hash}:blockHash`)
        }
        for (let key in transaction) {
            if (transaction[key] === undefined) {
                return undefined
            }
        }
        return transaction
    }

    async getTransactionByBlockHashAndIndex(blockHash: string, index: number) {
        return await this.getTransactionByHash(await this.get(`${blockHash}:tx:${index}`))
    }

    async getBlockByHash(hash: string) {
        if (!hash) {
            return undefined
        }

        let block: blockHeader = {
            hash,
            preHash: await this.get(`${hash}:preHash`),
            miner: await this.get(`${hash}:miner`),
            height: await this.get(`${hash}:height`),
            diff: await this.get(`${hash}:diff`),
            nonce: await this.get(`${hash}:nonce`),
            transactionHashs: []
        }
        let txCount = await this.get(`${hash}:transactionCount`)
        for (let i = 0; i < Number(txCount); i++) {
            let txHash = await this.get(`${hash}:tx:${i}`)
            if (txHash === undefined) {
                return undefined
            }
            block.transactionHashs.push(txHash)
        }
        for (let key in block) {
            if (block[key] === undefined) {
                return undefined
            }
        }
        return block
    }

    async getLatestBlock() {
        return await this.getBlockByHash(await this.get("lastestBlockHash"))
    }

    async getBlockByHeight(height: string) {
        return await this.getBlockByHash(await this.get(`height:${height}`))
    }

    private _makeUpdateLatestBlockOperate(blockHeader: blockHeader): {
        type: "put" | "del",
        key: string,
        value?: any
    } {
        return {
            type: "put",
            key: "lastestBlockHash",
            value: blockHeader.hash
        }
    }

    private async _makeRollbackLatestBlockOperate(): Promise<{
        type: "put" | "del",
        key: string,
        value?: any
    }> {
        let block = await this.getLatestBlock()
        if (!block) {
            return {
                type: "del",
                key: "lastestBlockHash"
            }
        }
        let lastHeight = new Decimal(block.height).sub(1)
        if (lastHeight.equals(0)) {
            return {
                type: "del",
                key: "lastestBlockHash"
            }
        }

        let lastBlock = await this.getBlockByHeight(lastHeight.toString())
        if (lastBlock) {
            return {
                type: "put",
                key: "lastestBlockHash",
                value: lastBlock.hash
            }
        }
        else {
            throw new Error("missing last block!")
        }
    }

    async putBlock(blockHeader: blockHeader, updateLastest: boolean = false): Promise<void> {
        let map = formatBlockHeaderRecord(blockHeader)
        let opArr: {
            type: "put" | "del",
            key: string,
            value?: any
        }[] = []
        for (let key of map.keys()) {
            opArr.push({
                type: "put",
                key: key,
                value: map.get(key)
            })
        }
        if (updateLastest) {
            opArr.push(this._makeUpdateLatestBlockOperate(blockHeader))
        }
        await this.batch(opArr)
    }

    async putTransaction(tx: transaction): Promise<void> {
        let map = formatTransactionRecord(tx)
        let opArr: {
            type: "put" | "del",
            key: string,
            value?: any
        }[] = []
        for (let key of map.keys()) {
            opArr.push({
                type: "put",
                key: key,
                value: map.get(key)
            })
        }
        await this.batch(opArr)
    }

    putTransactions(transactions: transaction[]): Promise<void>[] {
        return transactions.map(tx => this.putTransaction(tx))
    }

    async delBlock(blockHeader: blockHeader, rollback: boolean = false): Promise<void> {
        let map = formatBlockHeaderRecord(blockHeader)
        let opArr: {
            type: "put" | "del",
            key: string,
            value?: any
        }[] = []
        for (let key of map.keys()) {
            opArr.push({
                type: "del",
                key: key
            })
        }
        if (rollback) {
            opArr.push(await this._makeRollbackLatestBlockOperate())
        }
        await this.batch(opArr)
    }

    async delTransaction(tx: transaction): Promise<void> {
        let map = formatTransactionRecord(tx)
        let opArr: {
            type: "put" | "del",
            key: string,
            value?: any
        }[] = []
        for (let key of map.keys()) {
            opArr.push({
                type: "del",
                key: key,
            })
        }
        await this.batch(opArr)
    }

    delTransactions(transactions: transaction[]): Promise<void>[] {
        return transactions.map(tx => this.delTransaction(tx))
    }
}