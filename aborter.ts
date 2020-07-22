export class aborter {
    private _abort: boolean = false
    private _abortPromise: Promise<void>
    private _reject: (reason?: any) => void
    
    constructor() {
        this._abortPromise = new Promise((_, reject) => {
            this._reject = reject
        })
    }

    async abortablePromise(...args: Promise<any>[]) {
        if (this._abort) {
            throw new Error("already abort!")
        }
        return await Promise.race([this._abortPromise, ...args])
    }

    abort(reason?: any) {
        if (this._abort) {
            throw new Error("already abort!")
        }
        this._abort = true
        this._reject(reason)
    }
}