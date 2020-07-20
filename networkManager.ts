import { blockChainStatus, transaction, blockHeader } from './const'

export class networkManager {
    async downloadHeader(height: string): Promise<blockHeader> { return undefined }
    async downloadTransaction(hash: string): Promise<transaction> { return undefined }
}