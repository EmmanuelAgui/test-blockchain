import { v4 as uuidv4 } from 'uuid'
import Decimal from 'decimal.js'

import { blockHeader, transaction } from './@types'
import { blockChainService } from './blockChainService'

const args = process.argv.splice(2)

async function test() {
    try {
        let service = new blockChainService()
        await service.init()
        await service._net.clearAll()
        
        let latestBlock = await service._db.getLatestBlock()
        let block = await service._db.getBlockByHeight(args[0])
        if (!latestBlock || !block) {
            throw new Error("missing block!")
        }

        let forkHeight = new Decimal(args[1])
        let blockHeight = new Decimal(block.height)
        if (blockHeight.add(forkHeight).lessThanOrEqualTo(new Decimal(latestBlock.height))) {
            throw new Error("fork height must higher than local height!")
        }

        // 将分支之前的块拷贝过来.
        for (let h = new Decimal(1); h.lessThanOrEqualTo(blockHeight); h = h.add(1)) {
            let localBlock = await service._db.getBlockByHeight(h.toString())
            if (!localBlock) {
                throw new Error("missing block!")
            }
            let txs: transaction[] = []
            for (let txHash of (await localBlock).transactionHashs) {
                let tx = await service._db.getTransactionByHash(txHash)
                if (!tx) {
                    throw new Error("missing tx!")
                }
                txs.push(tx)
            }

            await service._net.batch(service._net.makePutBlockOperators(localBlock))
            await service._net.batch(service._net.makePutTransactionsOperators(txs))
        }

        // 随机生成分叉高度之后的块.
        let preHash = block.hash
        for (let h = blockHeight.add(1); h.lessThanOrEqualTo(blockHeight.add(forkHeight)); h = h.add(1)) {
            let b: blockHeader = {
                hash: uuidv4(),
                preHash: preHash,
                miner: "456789",
                height: `${h.toString()}`,
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
            await service._net.batch([service._net.makeUpdateLatestBlockOperator(b)])
            await service._net.batch(service._net.makePutBlockOperators(b))
            await service._net.batch(service._net.makePutTransactionOperators(t))

            preHash = b.hash
        }
    }
    catch(e) {
        console.log(`error in main ${e}`)
    }
}

test()