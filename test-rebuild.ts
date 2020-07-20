import { blockChainService } from './blockChainService'

async function test() {
    try {
        let service = new blockChainService()
        await service.init()
        await service._net.clearAll()
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