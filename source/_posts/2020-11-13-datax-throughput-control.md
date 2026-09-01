---
title: "DataX 的 speed.byte 为什么越调越怪：顺着源码把限速链路走一遍"
date: "2020-11-13 21:42:17"
updated: "2020-11-13 21:42:17"
categories:
- "数据同步"
tags:
- "DataX"
- "源码分析"
- "性能调优"
description: "从 DataX 2020 年源码解释 speed.byte、Channel 数量、Task 切分、窗口限流和 MemoryChannel 背压之间的关系。"
cover: /images/articles/datax-throughput-chain.svg
top_img: /images/articles/datax-throughput-chain.svg
permalink: /2020/11/13/datax-throughput-control/
comments: false
editorial_standard: expert-v1
---

DataX 任务跑慢了，很多人的第一反应是把 `job.setting.speed.byte` 往上调。这个动作有时有效，有时一点反应都没有，偶尔还会把目标库写得更慢。

问题出在我们很容易把它理解成一个总限速开关。DataX 启动前会用速度预算计算 Channel 数量，运行中再由每个 Channel 统计吞吐并决定要不要休眠。Reader 和 Writer 之间还有一个有界队列。任何一环跟不上，都会把前后两端拖住。

下面的代码基于 DataX 提交 `30842ca`，提交时间是 2020 年 11 月 9 日。这样可以避开后来版本的改动，也和这篇笔记的时间对得上。

![DataX 从速度预算到运行时背压的链路](/images/articles/datax-throughput-chain.svg)

<!-- more -->

## `byte` 和 `channel` 不是两个同时生效的旋钮

先看一段常见配置：

```json
{
  "job": {
    "setting": {
      "speed": {
        "byte": 33554432,
        "record": -1,
        "channel": 8
      }
    }
  }
}
```

直觉上，这是“总速度 32 MB/s，并发 8”。源码不是这么解释的。

`JobContainer.adjustChannelNumber()` 先检查 `byte` 和 `record`。只要其中一个启用，DataX 就用 Job 总速度除以单 Channel 速度，算出需要多少个 Channel。此时 JSON 里的 `speed.channel` 不参与计算。只有 `byte`、`record` 都没有启用，`speed.channel` 才是直接指定的并发数。

这里还藏着另一份配置：`core.transport.channel.speed`。它在 `core.json` 里，管的是单个 Channel，而任务 JSON 里的 `job.setting.speed` 管整个 Job。

| 配置项 | 它管什么 |
| --- | --- |
| `job.setting.speed.byte` | Job 每秒允许传输的总字节数，同时用于推导 Channel 数 |
| `job.setting.speed.record` | Job 每秒允许传输的总记录数，同时用于推导 Channel 数 |
| `job.setting.speed.channel` | 没有配置 byte、record 时，直接指定 Channel 数 |
| `core.transport.channel.speed.byte` | 单个 Channel 的字节速度上限 |
| `core.transport.channel.speed.record` | 单个 Channel 的记录速度上限 |

所以，任务里写了 32 MB/s，核心配置却没有单 Channel 上限，DataX 没法完成除法，会直接报配置错误。这个地方不能只看任务 JSON。

## 32 MB/s 为什么最后只启动 6 个 Channel

`adjustChannelNumber()` 的计算可以压成几行：

```text
channelByByte   = max(1, jobByteSpeed / channelByteSpeed)
channelByRecord = max(1, jobRecordSpeed / channelRecordSpeed)
needChannel     = min(channelByByte, channelByRecord)
```

除法是整数除法。总速度 32 MB/s，单 Channel 3 MB/s，算出来是 10 个 Channel，不会四舍五入成 11。

但 10 仍然不一定是最后的并发数。Reader 和 Writer 完成 `split()` 后，如果一共只生成了 6 个 Task，`schedule()` 还会做一次截断：

```java
this.needChannelNumber = Math.min(this.needChannelNumber, taskNumber);
```

结果就是 6。继续把 `speed.byte` 从 32 MB/s 加到 64 MB/s，运行日志里的 Channel 数可能纹丝不动。卡住它的不是速度预算，而是 Task 数量。此时该查 Reader 的切分键、切分范围和最终任务数，而不是继续改 `speed.byte`。

`byte` 和 `record` 同时打开时也一样，DataX 分别算一遍，取较小值。字节预算允许 10 个 Channel，记录数预算只允许 4 个，最后就是 4 个。

## 真正的限速发生在 `push` 之后

Channel 的调用顺序值得单独看。`push()` 会先执行 `doPush()`，成功后才调用 `statPush()`，所以并非先判断速度再写队列：

```java
public void push(final Record r) {
    Validate.notNull(r, "record不能为空.");
    this.doPush(r);
    this.statPush(1L, r.getByteSize());
}
```

到了 `statPush()`，DataX 会比较当前时间和上次统计时间。只有间隔达到 `flowControlInterval`，才重新计算本窗口的字节速度与记录速度。

```text
currentByteSpeed = byteDelta * 1000 / intervalMs
sleepMs = currentByteSpeed * intervalMs / byteLimit - intervalMs
```

如果 byte 和 record 都超限，两边各算一个休眠时间，取较大的那个。这套实现采用“采样一段，再睡一会儿”的方式，并非连续、平滑的令牌桶。数据库监控里看到锯齿并不奇怪，先把监控粒度和 `flowControlInterval` 对齐再判断。

![Channel push、队列等待与限流休眠的调用顺序](/images/articles/datax-channel-push-sequence.svg)

还有一个边界经常被忽略：限流发生在 Record 进入 DataX 传输链路以后。它可以压住持续吞吐，不能改变源库执行一条 SQL 的代价。全表扫描已经在数据库里发生了，再准确的 Channel 限速也补不上索引和分区条件。

## `waitWriterTime` 这个名字容易看反

默认的 `MemoryChannel` 同时限制记录条数和内存字节数。批量 Push 碰到下面任意一种情况，Reader 都要等：

```text
memoryBytes + batchBytes > byteCapacity
batchRecordCount > queue.remainingCapacity
```

源码在 `doPush()`、`doPushAll()` 里把这段等待记到 `waitWriterTime`。名字的意思是“等 Writer 腾位置”，不是 Writer 自己花掉的时间。这个指标高，通常说明数据写不出去：目标库提交慢、批次设置不合适、索引维护重，或者网络写入到了上限。

反过来，Writer 从空队列取数据时，等待会累计到 `waitReaderTime`。它高，应该往 Reader 查：抽取 SQL 慢、分片不均，或者某个切片的数据量远大于其他切片。

我更愿意把这两个值当成方向指示器，而不是最终结论。比如 `waitWriterTime` 高只能说明下游消化不及上游，具体是数据库锁、事务日志还是网络，要拿目标端监控继续对。仅凭 DataX 日志说“目标库性能差”，证据还不够。

## 调速度时，我会固定这几个量

先把数据集、Reader SQL、Writer 批次和运行时段固定。每轮只改 Channel 或速度预算中的一个，记录实际 Channel 数、总吞吐、两个等待时间、源端负载和目标端写入延迟。一次改五个参数，最后只能得到一组碰巧跑完的配置。

接着做阶梯测试。Channel 从 1、2、4 往上加，吞吐如果还接近线性增长，可以继续；吞吐已经不动而等待时间明显抬升，就停。多出来的并发只会增加连接、队列和事务压力。

速度预算应该按最慢的一端来定。源库稳定能读 45 MB/s，目标端长期只能写 28 MB/s，DataX 进程本身能跑 60 MB/s，任务就应该从 28 MB/s 以下开始配。60 MB/s 是压测出来的进程能力，不是生产链路的安全速度。

最后再做一次同数据、同时段的对照运行。我要确认 Channel 是否按预期生成、吞吐提升来自哪里，以及源库和目标库有没有用更高的延迟换来这点速度。“这次快了”算不上验收，解释不了的提升通常也复制不了。

## 留一个结论

DataX 的速度控制分成启动前和运行中两段。`JobContainer` 用总预算和单 Channel 预算计算并发，`schedule()` 再用 Task 数量兜底；任务跑起来以后，Channel 按统计窗口决定休眠，MemoryChannel 则用有界队列传递背压。

因此，`speed.byte` 不是越大越快。它首先改变的是并发计算，最终速度还受 Task 切分、Reader、Writer 和队列等待影响。排查时沿着这条链路看，比盯着一个参数反复试要可靠得多。

## 对照源码

- [`JobContainer.adjustChannelNumber()`：总速度换算 Channel 数](https://github.com/alibaba/DataX/blob/30842ca21e910b2a4ebc29eb9647b469f008ed00/core/src/main/java/com/alibaba/datax/core/job/JobContainer.java#L416-L486)
- [`JobContainer.schedule()`：Channel 数受 Task 数约束](https://github.com/alibaba/DataX/blob/30842ca21e910b2a4ebc29eb9647b469f008ed00/core/src/main/java/com/alibaba/datax/core/job/JobContainer.java#L492-L511)
- [`Channel.push()` 与 `statPush()`：入队、统计和休眠](https://github.com/alibaba/DataX/blob/30842ca21e910b2a4ebc29eb9647b469f008ed00/core/src/main/java/com/alibaba/datax/core/transport/channel/Channel.java#L120-L239)
- [`MemoryChannel`：队列容量和两类等待时间](https://github.com/alibaba/DataX/blob/30842ca21e910b2a4ebc29eb9647b469f008ed00/core/src/main/java/com/alibaba/datax/core/transport/channel/memory/MemoryChannel.java#L60-L125)
- [`core.json`：单 Channel 默认配置](https://github.com/alibaba/DataX/blob/30842ca21e910b2a4ebc29eb9647b469f008ed00/core/src/main/conf/core.json#L24-L46)
