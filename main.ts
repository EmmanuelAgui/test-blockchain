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