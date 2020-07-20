export class task {
    name: string
    done: boolean
    inTransaction: boolean
}

type handlerCallback = (td: taskDispatcher, t: task) => Promise<{
        name?: string,
        rollback?: boolean,
        commit?: boolean
} | void>

type handlerCallbackInfo = {
    process: handlerCallback
    processRollback: handlerCallback
}

export class taskDispatcher {
    private _abort: boolean = false
    private _resolved: boolean = true
    private _resolve: (t: task) => void

    private _taskList: task[] = []
    private _handlerMap = new Map<string, handlerCallbackInfo>()

    private _transactionTaskList: task[] = []
    private _transactionResolved: boolean = true
    private _transactionResolve: () => void
    private _transactionPromise: Promise<void>

    private _lifeCirclePromise: Promise<void>

    registerHandler(name: string, process: handlerCallback, processRollback: handlerCallback) {
        this._handlerMap.set(name, { process, processRollback })
    }

    async transaction() {
        if (this._abort) {
            throw new Error("taskDispatcher abort!")
        }

        while (!this._transactionResolved) {
            await this._transactionPromise
        }

        this._transactionResolved = false
        this._transactionPromise = new Promise((resolve) => {
            this._transactionResolve = resolve
        })
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
                let t = this._transactionTaskList[i]
                if (t.done) {
                    if (!this._handlerMap.has(t.name)) {
                        throw new Error(`missing handler ${t.name}`)
                    }
        
                    try {
                        await this._handlerMap.get(t.name).processRollback(this, t)
                    }
                    catch(e) {
                        console.log(`catch error in rollback: ${e}`)
                        break
                    }
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

    async newTask(name: string, inTransaction: boolean = false): Promise<void> {
        if (!inTransaction) {
            if (!this._transactionResolved) {
                await this._transactionPromise
            }
        }

        let t = new task()
        t.name = name
        t.done = false
        t.inTransaction = inTransaction

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
    }

    async abort() {
        this._abort = true
        this._taskList = []

        try {
            await this.rollback()
        }
        catch {
        }
        
        if (!this._resolved) {
            this._resolve(undefined)
            this._resolved = true
        }
    }

    restart() {
        (async () => {
            if (!this._abort) {
                this.abort()
                await this._lifeCirclePromise
            }
    
            this._abort = false
            this.start()
        })()
    }

    start() {
        return this._lifeCirclePromise = new Promise<void>(async (lifecircleResolve) => {
            while(!this._abort) {
                let t: task
                if (this._taskList.length > 0) {
                    t = this._taskList[0]
                    this._taskList = this._taskList.splice(1)
                }
                else {
                    this._resolved = false
                    t = await new Promise<task>((resolve) => {
                        this._resolve = resolve
                    })
                }

                if (this._abort) {
                    break
                }
    
                if (!this._handlerMap.has(t.name)) {
                    lifecircleResolve()
                    throw new Error(`missing handler ${t.name}`)
                }
    
                try {
                    let result = await this._handlerMap.get(t.name).process(this, t) as any

                    if (this._abort) {
                        break
                    }

                    t.done = true
                    if (result && result.commit) {
                        this.commit()
                    }
                    else if (result && result.rollback) {
                        await this.rollback()
                    }
                    else if (result && result.name) {
                        this.newTask(result.name, t.inTransaction)
                    }
                }
                catch(e) {
                    console.log(`catch task error: ${e}`)
                    if (!this._transactionResolved) {
                        await this.rollback()
                    }
                }
            }

            lifecircleResolve()
        })
    }
}