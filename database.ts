import levelup from 'levelup'
import leveldown from 'leveldown'
import { NotFoundError } from 'level-errors'
import { serializeOperator } from './serializeOperator'

// TODO: 持久化数据操作.
type databaseOperation = {
    type: "put" | "del",
    map: Map<string, string>
    old?: Map<string, string>
}

abstract class database extends serializeOperator<databaseOperation> {
    private _db: any;

    constructor(private _path: string) {
        super()
        this.open()
    }

    open() {
        if (!this._db) {
            this._db = levelup(leveldown(this._path, {
                createIfMissing: true
            }, (err) => {
                if (err) {
                    console.log(`${this._path} open failed`)
                }
            }))
        }
    }

    close() {
        if (this._db) {
            this._db.close((err) => {
                if (err) {
                    console.log(`${this._path} close failed`)
                }
            })
            this._db = undefined
        }
    }

    get(key: string) {
        return new Promise<string>((resolve, reject) => {
            this._db.get(key, (err, value) => {
                if (err) {
                    // 未找到.
                    if (err instanceof NotFoundError) {
                        resolve(undefined)
                        return
                    }
                    console.log(`${this._path} get failed`)
                    reject(err)
                }
                else {
                    resolve(Buffer.from(value).toString())
                }
            })
        })
    }

    put(key: string, value: any) {
        return new Promise((resolve, reject) => {
            this._db.put(key, value, (err) => {
                if (err) {
                    console.log(`${this._path} put failed`)
                    reject(err)
                }
                else {
                    resolve()
                }
            })
        })
    }

    del(key: string) {
        return new Promise((resolve, reject) => {
            this._db.del(key, (err) => {
                if (err) {
                    console.log(`${this._path} del failed`)
                    reject(err)
                }
                else {
                    resolve()
                }
            })
        })
    }

    batch(operations: {
        type: "put" | "del",
        key: string,
        value?: any
    }[]) {
        return new Promise((resolve, reject) => {
            this._db.batch(operations, (err) => {
                if (err) {
                    console.log(`${this._path} batch failed`)
                    reject(err)
                }
                else {
                    resolve()
                }
            })
        })
    }
}

type transactionRecord = {
    hash: string
    from: string
    to: string
    value: string
    nonce: string
    signature: string

    blockHash?: string
}

type blockRecord = {
    header: {
        hash: string,
        preHash: string,
        miner: string,
        height: string,
        diff: string,
        nonce: string,
        transactionCount: string
    }

    body: {
        transactions: transactionRecord[]
    }
}

export function trFromJson(json: any): transactionRecord {
    let j = JSON.parse(json)
    let tr: transactionRecord = {
        hash: j.hash,
        from: j.from,
        to: j.to,
        value: j.value,
        nonce: j.nonce,
        signature: j.signature
    }
    return tr
}

export function brFromJson(json: any): blockRecord {
    let j = JSON.parse(json)
    let br: blockRecord = {
        header: {
            hash: j.header.hash,
            preHash: j.header.preHash,
            miner: j.header.miner,
            height: j.header.height,
            diff: j.header.diff,
            nonce: j.header.nonce,
            transactionCount: j.header.transactionCount
        },
        body: {
            transactions: j.body.transactions.map((v) => {
                return trFromJson(v)
            })
        }
    }
    return br
}

function formatTransactionRecord(tr: transactionRecord): Map<string, string> {
    let map = new Map<string, string>()
    map.set(`${tr.hash}:from`, tr.from)
    map.set(`${tr.hash}:to`, tr.to)
    map.set(`${tr.hash}:value`, tr.value)
    map.set(`${tr.hash}:nonce`, tr.nonce)
    map.set(`${tr.hash}:signature`, tr.signature)
    if (tr.blockHash) {
        map.set(`${tr.hash}:blockHash`, tr.blockHash)
    }
    return map
}

function formatBlockRecord(br: blockRecord): Map<string, string> {
    let map = new Map<string, string>()
    map.set(`${br.header.hash}:preHash`, br.header.preHash)
    map.set(`${br.header.hash}:miner`, br.header.miner)
    map.set(`${br.header.hash}:height`, br.header.height)
    map.set(`${br.header.hash}:diff`, br.header.diff)
    map.set(`${br.header.hash}:nonce`, br.header.nonce)
    map.set(`${br.header.hash}:transactionCount`, br.header.transactionCount)

    for (let i = 0; i < br.body.transactions.length; i++) {
        map.set(`${br.header.hash}:tx:${i}`, br.body.transactions[i].hash)
    }
    return map
}

import { Decimal } from 'decimal.js';

export class databaseService extends database {
    constructor(path: string) {
        super(path)
    }

    async getTransactionByHash(hash: string) {
        let transaction: transactionRecord = {
            hash,
            from: await this.get(`${hash}:from`),
            to: await this.get(`${hash}:to`),
            value: await this.get(`${hash}:value`),
            nonce: await this.get(`${hash}:nonce`),
            signature: await this.get(`${hash}:signature`)
        }
        return transaction
    }

    async getTransactionByBlockHashAndIndex(blockHash: string, index: number) {
        return await this.getTransactionByHash(await this.get(`${blockHash}:tx:${index}`))
    }

    async getBlockByHash(hash: string) {
        let block: blockRecord = {
            header: {
                hash,
                preHash: await this.get(`${hash}:preHash`),
                miner: await this.get(`${hash}:miner`),
                height: await this.get(`${hash}:height`),
                diff: await this.get(`${hash}:diff`),
                nonce: await this.get(`${hash}:nonce`),
                transactionCount: await this.get(`${hash}:transactionCount`)
            },
            body: {
                transactions: []
            }
        }
        for (let i = 0; i < Number(block.header.transactionCount); i++) {
            block.body.transactions.push(await this.getTransactionByBlockHashAndIndex(block.header.hash, i))
        }
    }

    async getBlockByHeight(height: string) {
        return await this.getBlockByHash(await this.get(`${height}:b`))
    }

    async putTransaction(tr: transactionRecord) {
        
    }

    async putBlock(br: blockRecord) {

    }

    protected async process(data: databaseOperation) {
        data.old = new Map<string, string>()
        if (data.type === "put") {
            for (let key of data.map.keys()) {
                data.old.set(key, await this.get(key))
                await this.put(key, data.map[key])
            }
        }
        else {
            for (let key of data.map.keys()) {
                data.old.set(key, await this.get(key))
                await this.del(key)
            }
        }
    }

    protected async processRollback(data: databaseOperation) {
        if (data.old) {
            for (let key of data.old.keys()) {

            }
        }
    }
}
