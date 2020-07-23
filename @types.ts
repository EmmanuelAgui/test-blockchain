export type blockChainStatus = {
    // 用户余额.
    userBalance: Map<string, string>

    // 当前块头.
    currentBlockHeader: blockHeader
    // 当前块的交易.
    currentTransactions: transaction[]
}

export type syncInfo = {
    // 当前同步模式.
    syncMode: "database" | "network",
    // 同步的目标高度.
    maxHeight: string
    // 同步的目标块哈希.
    maxHeightBlockHash: string
    // 同步的目标节点.
    peerInfo: string
}

export type transaction = {
    // 交易哈希.
    hash: string
    // 源地址.
    from: string
    // 目标地址.
    to: string
    // 转帐金额.
    value: string
    nonce: string
    signature: string

    blockHash?: string
}

export type blockHeader = {
    // 块哈希.
    hash: string,
    // 上一个块的哈希.
    preHash: string,
    // 打包的矿工.
    miner: string,
    // 块高度.
    height: string,
    diff: string,
    nonce: string,
    // 块中所有交易的哈希.
    transactionHashs: string[]
}