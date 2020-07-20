import levelup from 'levelup'
import leveldown from 'leveldown'
import { NotFoundError } from 'level-errors'

export class database {
    private _db: any;

    constructor(private _path: string) {
    }

    open() {
        return new Promise((resolve, reject) => {
            if (!this._db) {
                this._db = levelup(leveldown(this._path, {
                    createIfMissing: true
                }, (err) => {
                    if (err) {
                        console.log(`${this._path} open failed`)
                        reject(err)
                    }
                    else {
                        resolve()
                    }
                }))
            }
            else {
                reject("database already open!")
            }
        })
    }

    close() {
        return new Promise((resolve, reject) => {
            if (this._db) {
                this._db.close((err) => {
                    if (err) {
                        console.log(`${this._path} close failed`)
                        reject(err)
                    }
                })
                this._db = undefined
                resolve()
            }
            else {
                reject("database already close!")
            }
        })
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