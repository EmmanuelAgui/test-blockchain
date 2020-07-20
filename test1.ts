/*
import WebSocket from 'ws'

import { wsClient } from './wsClient'

const args = process.argv.splice(2)

const wsClients: wsClient[] = []
for (let address of args) {
    wsClients.push(new wsClient(address))
}

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
*/

import { v4 as uuidv4 } from 'uuid'

import { blockHeader, transaction } from './const'
import { blockChainService, printBlockChainStatus } from './blockChainService'

async function test() {
    try {
        let service = new blockChainService()
        await service.init()
        await service._db.clearAll()

        let preHash = "000"
        for (let h = 1; h <= 10; h++) {
            let b: blockHeader = {
                hash: uuidv4(),
                preHash: preHash,
                miner: "456789",
                height: `${h}`,
                diff: "000",
                nonce: "000",
                transactionHashs: []
            }
    
            let r = Math.random()
            let t: transaction = {
                hash: uuidv4(),
                from: preHash === "000" ? "123456" : (r > 0.5 ? "123456" : "456789"),
                to: preHash === "000" ? "456789" : (r > 0.5 ? "456789" : "123456"),
                value: "1",
                nonce: "000",
                signature: "000"
            }
            b.transactionHashs.push(t.hash)
            await service._db.putBlock(b, true)
            await service._db.putTransaction(t)

            preHash = b.hash
        }

        await service.startRebuild();

        (async () => {
            try {
                console.log("======== coroutine start ========")
                await service.start()
                console.log("======== coroutine end ========")
            }
            catch(e) {
                console.log(`======== coroutine error ========`)
                console.log(`${e}`)
                console.log(`======== coroutine error over ========`)
            }
        })()
    }
    catch(e) {
        console.log(`error in main ${e}`)
    }
}

test()