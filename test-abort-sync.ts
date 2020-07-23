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

        let latestBlock = await service._net.getLatestBlock()
        if (!latestBlock) {
            throw new Error("missing remote latest block")
        }

        // 一般重建完成之前不会同步, 这里只是为了测试abort.
        setTimeout(() => {
            service.onReceiveNewBlock(latestBlock.hash, latestBlock.height, "")
        }, 500)
        await service.startRebuild();
    }
    catch(e) {
        console.log(`error in main ${e}`)
    }
}

test()