type task<T> = {
    data: T,
    resolve: any,
    reject: any,
    done: boolean
}

export abstract class serializeOperator<T> {
    private _taskList: task<T>[] = []
    private _resolved: boolean = true
    private _abort: boolean = false
    private _resolve: (t: task<T>) => void

    private _transactionTaskList: task<T>[] = []
    private _transactionResolved: boolean = true
    private _transactionResolve: () => void
    private _transactionPromise: Promise<void>

    protected abstract process(d: T): Promise<any>;
    protected abstract processRollback(d: T): Promise<any>;

    private setResolve(t: task<T>) {
        if (this._resolved) {
            this._taskList.push(t)
        }
        else {
            this._resolve(t)
            this._resolved = true
        }
    }

    async transaction() {
        if (this._abort) {
            throw new Error("operator abort!")
        }

        while (!this._transactionResolved) {
            await this._transactionPromise
        }

        this._transactionResolved = false
        this._transactionPromise = new Promise((resolve, reject) => {
            this._transactionResolve = resolve
        })
    }

    commit() {
        if (this._abort) {
            throw new Error("operator abort!")
        }

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
        if (this._abort) {
            throw new Error("operator abort!")
        }

        if (!this._transactionResolved) {
            for (let i = this._transactionTaskList.length - 1; i >= 0; i--) {
                if (this._transactionTaskList[i].done) {
                    await this.processRollback(this._transactionTaskList[i].data)
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
            this.setResolve(t)
        })
    }

    async abort() {
        for (let t of this._taskList) {
            t.reject("operator abort!")
        }
        this._taskList = []

        for (let i = this._transactionTaskList.length - 1; i >= 0; i--) {
            if (this._transactionTaskList[i].done) {
                await this.processRollback(this._transactionTaskList[i].data)
            }
        }
        this._transactionTaskList = []
        if (!this._resolved) {
            this._resolve(undefined)
        }
        if (!this._transactionResolved) {
            this._transactionResolve()
        }

        this._resolved = true
        this._transactionResolved = true
        this._abort = true
    }

    async start() {
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
                return
            }

            try {
                t.resolve(await this.process(t.data))
            }
            catch(e) {
                t.reject(e)
            }
            t.done = true
        }
    }
}