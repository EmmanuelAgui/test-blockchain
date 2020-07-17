import levelup from 'levelup'
import leveldown from 'leveldown'
import { NotFoundError } from 'level-errors'

class database {
    private _db: any;

    constructor(private _path: string) {
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
        return new Promise((resolve, reject) => {
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
            transactions: j.body.transactions.map((k, v) => {
                return trFromJson(v)
            })
        }
    }
    return br
}

export class blockDatabase extends database {
    constructor(path: string) {
        super(path)
    }


}
