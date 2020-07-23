export class aborter {
    private _reason: any;
    private _abort: boolean = false
    private _abortPromise: Promise<void>
    private _reject: (reason?: any) => void
    
    constructor() {
        this.reset()
    }

    abortablePromise<T>(p: Promise<T>) {
        if (this._abort) {
            return Promise.reject(this._reason)
        }
        return Promise.race([this._abortPromise, p]) as Promise<T>
    }

    abort(reason?: any) {
        if (!this._abort) {
            this._reason = reason
            this._abort = true
            this._reject(reason)
        }
    }

    isAborted() {
        return this._abort
    }

    reset() {
        this._reason = undefined
        this._abort = false
        this._abortPromise = new Promise((_, reject) => {
            this._reject = reject
        })
    }
}