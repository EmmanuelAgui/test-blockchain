import { v4 as uuidv4 } from 'uuid'

import { blockHeader, transaction } from './const'
import { blockChainService } from './blockChainService'
import Decimal from 'decimal.js'

const args = process.argv.splice(2)

async function test() {
    try {
        let service = new blockChainService()
        await service.init()
        await service._db.clearAll()
        await service._net.clearAll()

        let preHash = "000"
        for (let h = new Decimal(1); h.lessThanOrEqualTo(new Decimal(args[0])); h = h.add(1)) {
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
            await service._db.putBlock(b, true)
            await service._db.putTransaction(t)

            preHash = b.hash
        }
    }
    catch(e) {
        console.log(`error in main ${e}`)
    }
}

test()