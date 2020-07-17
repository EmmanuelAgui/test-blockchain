import WebSocket from 'ws'

export class wsClient {
    ws: WebSocket;

    constructor(public address: string) {
        this.ws = new WebSocket(address);
        this.ws.on("open", () => {
            this.ws.send("hellow")
        })
        this.ws.on("message", (data) => {
            console.log(`incoming ${data}`)
        })
        this.ws.on("close", () => {
            console.log("wsClient close")
        })
        this.ws.on("error", () => {
            console.log("wsClient error")
        })
    }
}