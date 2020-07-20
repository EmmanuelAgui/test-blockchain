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
import { blockChainService } from './blockChainService'

async function test() {
    try {
        let service = new blockChainService()
        await service.init()
        await service._db.clearAll()

        let b1: blockHeader = {
            hash: uuidv4(),
            preHash: "000",
            miner: "456789",
            height: "1",
            diff: "000",
            nonce: "000",
            transactionHashs: []
        }

        let t1: transaction = {
            hash: uuidv4(),
            from: "123456",
            to: "456789",
            value: "101",
            nonce: "000",
            signature: "000"
        }
        b1.transactionHashs.push(t1.hash)
        await service._db.putBlock(b1, true)
        await service._db.putTransaction(t1)

        let b2: blockHeader = {
            hash: uuidv4(),
            preHash: b1.hash,
            miner: "456789",
            height: "2",
            diff: "000",
            nonce: "000",
            transactionHashs: []
        }
        let t2: transaction = {
            hash: uuidv4(),
            from: "456789",
            to: "123456",
            value: "7.777",
            nonce: "000",
            signature: "000"
        }
        b2.transactionHashs.push(t2.hash)
        await service._db.putBlock(b2, true)
        await service._db.putTransaction(t2)

        await service.startRebuild();

        (async () => {
            console.log("========coroutine start========")
            await service.start()
            console.log("========coroutine end========")
        })()
    }
    catch(e) {
        console.log(`error in main ${e}`)
    }
}

test()