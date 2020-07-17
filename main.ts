import WebSocket from 'ws'

import { wsClient } from './wsClient'

const args = process.argv.splice(2)

const wsServer = new WebSocket.Server({
        port: 8080,
        perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages
        // should not be compressed.
    }
})

wsServer.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
    });

    ws.send('something');
});

wsServer.on('close', function close(ws) {
    console.log("wsServer close")
})

wsServer.on('error', function close(ws) {
    console.log("wsServer error")
})

const wsClients: wsClient[] = []
for (let address of args) {
    wsClients.push(new wsClient(address))
}

import { serializeOperator } from './serializeOperator'

type mydata = {
    name: string,
    value: string
}

class testClass extends serializeOperator<mydata> {
    protected async process(d: mydata) {
        console.log(`process: ${d.name} ${d.value}`)
    }

    protected async processRollback(d: mydata) {
        console.log(`rollback: ${d.name} ${d.value}`)
    }
}

function foo() {
    let obj = new testClass();
    (async () => {
        console.log("start")
        await obj.start()
        console.log("end")
    })();

    (async () => {
        try {
            let tx = await obj.transaction()
            await tx.deal({ name: "hhh0", value: "hhh2"})
            await tx.deal({ name: "hhh1", value: "hhh2"})
            await tx.deal({ name: "hhh2", value: "hhh2"})
            await tx.deal({ name: "hhh3", value: "hhh2"})
            await tx.deal({ name: "hhh4", value: "hhh2"})
            await tx.rollback()
        }
        catch(e) {
            console.log(`1 ${e}`)
        }
    })();

    (async () => {
        try {
            await obj.deal({ name: "hhh5", value: "hhh2"})
            await obj.deal({ name: "hhh6", value: "hhh2"})
            await obj.deal({ name: "hhh7", value: "hhh2"})
            let tx = await obj.transaction()
            await tx.deal({ name: "hhh8", value: "hhh2"})
            await tx.deal({ name: "hhh9", value: "hhh2"})
            await tx.rollback()
        }
        catch(e) {
            console.log(`2 ${e}`)
        }
    })();

    (async () => {
        try {
            await obj.deal({ name: "hhh10", value: "hhh2"})
            await obj.deal({ name: "hhh11", value: "hhh2"})
            let tx = await obj.transaction()
            await tx.deal({ name: "hhh12", value: "hhh2"})
            await tx.deal({ name: "hhh13", value: "hhh2"})
            await tx.deal({ name: "hhh14", value: "hhh2"})
            await tx.rollback()
        }
        catch(e) {
            console.log(`3 ${e}`)
        }
    })();
}

foo()
