import { blockChainService } from './blockChainService'

async function test() {
    try {
        let service = new blockChainService()
        await service.init()
        await service._net.clearAll();

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
    }
    catch(e) {
        console.log(`error in main ${e}`)
    }
}

test()