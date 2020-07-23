type taskProcessor<U> = {
    process: (...args: any[]) => Promise<U>,
    name: string
}

type task<U> = {
    name: string,
    args: any[],
    done: boolean,
    resolve: (u: U) => void,
    reject: (err?: any) => void
}

export class taskDispatcher<U> {
    private _abort: boolean = false

    private _resolved: boolean = true
    private _resolve: (t: task<U>) => void

    private _taskList: task<U>[] = []
    private _taskProcessorMap = new Map<string, taskProcessor<U>>()

    private _lifecircleResolved: boolean = true
    private _lifecirclePromise: Promise<void>

    registerTaskProcessor(name: string,
        process: (...args: any[]) => Promise<U>,) {
        this._taskProcessorMap.set(name, { process, name })
    }

    processTask(name: string, ...args: any[]) {
        return new Promise<U>((resolve, reject) => {
            if (!this._taskProcessorMap.has(name)) {
                throw new Error(`missing task processer ${name}`)
            }

            let t: task<U> = {
                name: name,
                args: args,
                done: false,
                resolve: resolve,
                reject: reject
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

    abort() {
        this._abort = true
        for (let t of this._taskList) {
            t.reject("taskDispatcher abort!")
        }
        this._taskList = []
        
        if (!this._resolved) {
            this._resolve(undefined)
            this._resolved = true
        }
    }

    restart() {
        (async () => {
            if (!this._abort) {
                this.abort()
                await this._lifecirclePromise
            }
    
            this._abort = false
            this.start()
        })()
    }

    start() {
        if (!this._lifecircleResolved) {
            throw new Error("taskDispatcher already start!")
        }
        this._lifecircleResolved = false
        return this._lifecirclePromise = new Promise(async (lifecircleResolve) => {
            while(!this._abort) {
                let t: task<U>
                if (this._taskList.length > 0) {
                    t = this._taskList.shift()
                }
                else {
                    this._resolved = false
                    t = await new Promise<task<U>>((resolve) => {
                        this._resolve = resolve
                    })
                }

                if (this._abort) {
                    break
                }
    
                this._taskProcessorMap.get(t.name).process(...t.args).then(u => {
                    t.resolve(u)
                    t.done = true
                }, err => {
                    t.reject(err)
                })
            }

            this._lifecircleResolved = true
            lifecircleResolve()
        })
    }
}