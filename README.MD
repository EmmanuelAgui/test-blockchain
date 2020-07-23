# test-blockchain

## 项目概述

1. 本demo实现了一个类似以太坊的链的重建, 同步及回滚逻辑
1. 由于是demo所以没有实现校验交易签名, 没有检查工作量证明, 也没有对nonce做处理
1. 只对用户的余额及矿工出块奖励进行了业务处理
1. 矿工的出块奖励固定为2
1. 块哈希及交易哈希通通由uuid代替

---

## 文件内容

+ `blockChainService`实现了区块链的核心逻辑, 包括下载, 重建, 同步, 回滚
+ `@types`中定义了各种数据类型
+ `database`封装了levelup及leveldown两个库, 实现了leveldb数据库
+ `databaseService`继承自`database`, 对储存读取块及交易进行了业务封装
+ `fakeNetworkService`继承自`databaseService`, 也是一个leveldb数据库, 模拟远程节点的数据
+ `aborter`实现了一个简单的中断器
+ `taskDispatcher`实现了任务调度器, 包括以下方法
    - `processTask`新增一个任务
    - `registerTaskProcessor`注册一个任务处理器
    - `abort`中断调度器
    - `restart`重启调度器
    - `start`开始任务调度
+ `test-generate-blocks`实现了在本地随机生成块逻辑
+ `test-generate-fork`实现了在远程生成块的逻辑
+ `test-rebuild`实现了本地重建逻辑
+ `test-sync`实现了本地重建及远程同步逻辑

---

## 测试命令

```
npm run test-gb -- 100
```

清除原来本地的所有的数据, 在本地数据库中随机从0开始生成100个块

```
npm run test-gf -- 50 60
```

清除原来远程节点中所有的数据, 在模拟的远程节点的数据库中从本地的第50个块开始分叉60个块(此时远程的链的高度为110)

**只有当远程的链的高度比本地高时才会回滚并同步远程的链**

```
npm run test-rebuild
```

根据本地数据库中的数据重建节点

```
npm run test-sync
```

根据本地数据库中的数据重建后从远程节点同步数据

```
npm run test-abort-sync
```

在同步进行时, 接受到了一个高度更高的分支, 中断当前同步, 从新的分支重新开始同步

