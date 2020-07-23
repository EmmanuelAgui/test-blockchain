import { blockChainService } from './blockChainService'

async function test() {
    try {
        let service = new blockChainService()
        await service.init();

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

        await service.startRebuild();
        let latestBlock = await service._net.getLatestBlock()
        if (!latestBlock) {
            throw new Error("missing remote latest block")
        }
        service.onReceiveNewBlock(latestBlock.hash, latestBlock.height, "")
    }
    catch(e) {
        console.log(`error in main ${e}`)
    }
}

test()