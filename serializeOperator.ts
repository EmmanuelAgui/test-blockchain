type task<T> = {
    data: T,
    resolve: any,
    reject: any,
    done: boolean
}

export class serializeTransaction<T> {
    constructor(private _operator: serializeOperator<T>) {
    }

    commit() {
        this._operator.commit()
    }

    rollback() {
        return this._operator.rollback()
    }

    deal(data: T) {
        return this._operator.deal(data, true)
    }
}

export class serializeOperator<T> {
    private _taskList: task<T>[] = []
    private _resolved: boolean = true
    private _abort: boolean = false
    private _resolve: (t: task<T>) => void

    private _transactionTaskList: task<T>[] = []
    private _transactionResolved: boolean = true
    private _transactionResolve: () => void
    private _transactionPromise: Promise<void>

    private _lifeCirclePromise: Promise<void>

    constructor(
        private _process: (d: T) => Promise<any>,
        private _processRollback: (d: T) => Promise<any>) {
    }

    async transaction() {
        if (this._abort) {
            throw new Error("operator abort!")
        }

        while (!this._transactionResolved) {
            await this._transactionPromise
        }

        this._transactionResolved = false
        this._transactionPromise = new Promise((resolve) => {
            this._transactionResolve = resolve
        })
        return new serializeTransaction<T>(this)
    }

    commit() {
        if (!this._transactionResolved) {
            this._transactionResolve()
            this._transactionResolved = true
            this._transactionTaskList = []
        }
        else {
            throw new Error("illegal commit!")
        }
    }

    async rollback() {
        if (!this._transactionResolved) {
            for (let i = this._transactionTaskList.length - 1; i >= 0; i--) {
                if (this._transactionTaskList[i].done) {
                    await this._processRollback(this._transactionTaskList[i].data)
                }
            }
            this._transactionResolve()
            this._transactionResolved = true
            this._transactionTaskList = []
        }
        else {
            throw new Error("illegal rollback!")
        }
    }

    async deal(data: T, inTransaction: boolean = false) {
        if (this._abort) {
            throw new Error("operator abort!")
        }

        if (!inTransaction) {
            if (!this._transactionResolved) {
                await this._transactionPromise
            }
        }
        return new Promise((resolve, reject) => {
            let t = {
                data,
                resolve,
                reject,
                done: false
            }
            if (inTransaction) {
                this._transactionTaskList.push(t)
            }

            if (this._resolved) {
                this._taskList.push(t)
            }
            else {
                this._resolve(t)
                this._resolved = true
            }
        })
    }

    async abort() {
        this._abort = true

        for (let t of this._taskList) {
            t.reject("operator abort!")
        }
        this._taskList = []

        try {
            await this.rollback()
        }
        catch(e) {
        }
        
        if (!this._resolved) {
            this._resolve(undefined)
            this._resolved = true
        }
        if (!this._transactionResolved) {
            this._transactionResolve()
            this._transactionResolved = true
        }

        await this._lifeCirclePromise
    }

    async restart() {
        if (!this._abort) {
            await this.abort()
        }

        this._abort = false
        this.start()
    }

    start() {
        return this._lifeCirclePromise = new Promise<void>(async (resolve) => {
            while(!this._abort) {
                let t: task<T>
                if (this._taskList.length > 0) {
                    t = this._taskList[0]
                    this._taskList = this._taskList.splice(1)
                }
                else {
                    this._resolved = false
                    t = await new Promise<task<T>>((resolve) => {
                        this._resolve = resolve
                    })
                }
    
                if (this._abort) {
                   break
                }
    
                try {
                    t.resolve(await this._process(t.data))
                }
                catch(e) {
                    // 如果在事务中发生异常, 则直接回滚.
                    if (!this._transactionResolved) {
                        this.rollback()
                    }

                    t.reject(e)
                }
                t.done = true
            }

            resolve()
        })
    }
}