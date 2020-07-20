import { transaction, blockHeader } from './const'
import { databaseService } from './databaseService'

export class fakeNetworkService extends databaseService {
    constructor(path: string) {
        super(path)
    }

    async downloadHeader(height: string): Promise<blockHeader> { return this.getBlockByHeight(height) }
    async downloadTransaction(hash: string): Promise<transaction> { return this.getTransactionByHash(hash) }
}