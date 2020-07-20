import { database } from './database'
import { blockChainStatus, transaction, blockHeader } from './const'

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
        let transaction: transaction = {
            hash,
            from: await this.get(`${hash}:from`),
            to: await this.get(`${hash}:to`),
            value: await this.get(`${hash}:value`),
            nonce: await this.get(`${hash}:nonce`),
            signature: await this.get(`${hash}:signature`),
            blockHash: await this.get(`${hash}:blockHash`)
        }
        return transaction
    }

    async getTransactionByBlockHashAndIndex(blockHash: string, index: number) {
        return await this.getTransactionByHash(await this.get(`${blockHash}:tx:${index}`))
    }

    async getBlockByHash(hash: string) {
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
            block.transactionHashs.push(await this.get(`${hash}:tx:${i}`))
        }
    }

    async getBlockByHeight(height: string) {
        return await this.getBlockByHash(await this.get(`height:${height}`))
    }

    async putStatus(status: blockChainStatus): Promise<void> {}
    async putBlock(blockHeader: blockHeader): Promise<void> {}
    putTransactions(transactions: transaction[]): Promise<void>[] { return [] }

    async delStatus(status: blockChainStatus): Promise<void> {}
    async delBlock(blockHeader: blockHeader): Promise<void> {}
    delTransactions(transactions: transaction[]): Promise<void>[] { return [] }
}