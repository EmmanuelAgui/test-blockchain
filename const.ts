export type blockChainStatus = {
    userBalance: Map<string, string>

    syncMode?: "network" | "database"
    maxHeight: string
    currentBlockHeader: blockHeader
    currentTransactions: transaction[]
}

export type transaction = {
    hash: string
    from: string
    to: string
    value: string
    nonce: string
    signature: string

    blockHash?: string
}

export type blockHeader = {
    hash: string,
    preHash: string,
    miner: string,
    height: string,
    diff: string,
    nonce: string,
    transactionHashs: string[]
}