---
title: "Flink Checkpoint 为什么总在背压时超时：先区分 barrier 到达和状态落盘"
date: "2021-06-12 21:08:47"
updated: "2021-06-12 21:08:47"
categories:
- "实时计算"
tags:
- "Flink"
- "Checkpoint"
- "背压"
description: "结合 Flink 1.13.1 的 barrier 处理源码与监控指标，拆解 checkpoint start delay、alignment、同步快照和异步落盘的不同瓶颈。"
cover: /images/articles/flink-checkpoint-backpressure.svg
top_img: /images/articles/flink-checkpoint-backpressure.svg
permalink: /2021/06/12/flink-checkpoint-backpressure/
comments: false
editorial_standard: expert-v1
---

Flink 作业平时运行正常，一到流量高峰，checkpoint duration 突然从几十秒拉长到超时。第一反应通常是 RocksDB 或 HDFS 写得慢，于是继续调 checkpoint timeout。超时时间变长以后，失败次数可能少了，恢复点却越来越旧，背压也没有消失。

Checkpoint 的端到端时间不只是“状态写入存储”的时间。barrier 从 source 往下游传递，要先穿过已有的数据和网络缓冲；多输入算子还要等各个 channel 的同一轮 barrier 到齐。上游或下游已经背压时，barrier 本身就可能走不动，状态后端甚至还没开始做主要工作。

我排查这类问题时，会先把一次 checkpoint 拆成 start delay、alignment、同步快照和异步落盘四段。只有知道时间花在哪一段，参数调整才有意义。

![Flink 背压下 checkpoint 的四段耗时](/images/articles/flink-checkpoint-backpressure.svg)

<!-- more -->

## End-to-End Duration 由最后一个 subtask 决定

Flink 1.13.1 的 checkpoint 监控文档对 End to End Duration 的定义很明确：从 JobManager 触发 checkpoint，到最后一个 subtask 返回确认。它通常会大于任意一个 subtask 实际做状态快照的时间。

这句话决定了排查入口。一个拓扑有 200 个 subtask，只要其中一个分区的数据倾斜、外部调用变慢或网络 channel 堵住，整轮 checkpoint 都要等它。看作业级的平均耗时，很容易把那个长尾 subtask 淹没。

我会直接进入 checkpoint details，按 subtask 排序看下面四项：

| 指标 | 它在回答什么 |
| --- | --- |
| Start Delay | barrier 从创建到这个 subtask 收到第一个 barrier，路上等了多久 |
| Alignment Duration | 第一个 barrier 到达后，等其余输入 channel 的 barrier 花了多久 |
| Sync Duration | operator 同步做状态快照、阻塞正常处理花了多久 |
| Async Duration | 异步写 checkpoint 存储以及相关等待花了多久 |

先找同一轮 checkpoint 中最大值落在哪个 subtask，再回到拓扑看它的上下游。只看全局曲线，无法分辨是 barrier 在路上堵住、输入没有对齐，还是状态文件真的写得慢。

## Start Delay 高，说明 barrier 还没到现场

Start Delay 是 barrier 创建到 subtask 收到第一个 barrier 的时间。如果 source 附近很低、沿拓扑向下游逐级升高，往往说明数据路径上已有排队，barrier 跟着数据一起被延迟。

这时直接优化 RocksDB 没有依据。可以先对照算子的 busy、backPressured、idle 状态，检查 sink 吞吐、外部系统响应时间、序列化开销和数据倾斜。下游消费不过来，背压会沿数据交换链路往上游传播，所以“哪个算子显示 HIGH”不等于它就是最初的瓶颈。

Flink 1.13.1 Web UI 的背压状态也是采样结果。默认采样 100 次，每次间隔 50 ms；样本中超过一半处于背压才显示 HIGH，而且至少 60 秒后才重新采样。它适合快速定位，不是一条连续、无损的时间线。

我会把 checkpoint 的 trigger time 和外部系统指标对齐。例如 sink 写 Kafka、Elasticsearch 或数据库，就看同一时间段的请求延迟、限流、连接池等待和错误率。若外部写入下降先发生，Flink 背压和 checkpoint start delay 随后上升，因果顺序就比一张 HIGH 截图清楚得多。

## Alignment 高，是输入 channel 到达不一致

Exactly-once 的 aligned checkpoint 中，多输入算子收到某个 channel 的 barrier 后，会阻塞这个 channel，继续等待其他 channel 的同一轮 barrier。监控文档把 Alignment Duration 定义为收到第一个和最后一个 barrier 之间的时间。

源码里的 `SingleCheckpointBarrierHandler.processBarrier()` 也按这个边界记录：第一个 barrier 到达时标记 alignment start；收到的 barrier 数等于 open channel 数时，标记 alignment end，并完成 `allBarriersReceivedFuture`。

如果一个 join 或 union 算子的某路输入稳定、另一路严重背压，先到的 channel 会等待慢的一路。alignment time 增长不一定表示这个多输入算子计算慢，它可能只是第一个能观测到两路速度差异的位置。

排查时要把每条输入边分开看：

- 上游 subtask 是否有数据倾斜，某几个分区明显更忙；
- 两路 source 的吞吐和 watermark 是否出现差异；
- 网络 buffer 是否长期占满；
- 慢输入的上游是否被更下游的反压波及；
- checkpoint 之间是否没有足够暂停，前一轮还未恢复就触发下一轮。

Alignment 是症状出现的位置，不必然是根因所在的位置。沿慢 channel 向上游追到第一个吞吐下降或资源饱和的算子，才算找到入口。

## Sync 和 Async 高要分别处理

Sync Duration 包含 operator 的同步状态快照，这段时间 subtask 不能正常处理记录和 timer。它明显升高时，我会检查状态大小、序列化成本、主线程上的同步工作，以及是否存在单个 key 或单个 subtask 状态特别大。

Async Duration 主要是把 checkpoint 数据写到配置的文件系统。它升高时才重点看 checkpoint 存储吞吐、网络、DataNode 状态、增量 checkpoint 命中情况和同时写入量。即使是异步阶段，长时间占用 IO 和上传线程也会影响下一轮 checkpoint 与正常处理。

状态大小也不能只看作业合计。一个 subtask 的 checkpoint data size 显著高于同并行度其他 subtask，通常值得检查 key 分布。总状态 1 TB 均匀分在 200 个分区，与其中一个分区单独承担 200 GB，恢复和 checkpoint 的长尾完全不同。

我会选择两轮相邻 checkpoint 做对照。一轮在正常流量、一轮在高峰，比较同一 subtask 的 Start Delay、Alignment、Sync、Async 和 Data Size。变量落在哪一段，后续实验就只动对应层面。

## Unaligned checkpoint 不是背压修复开关

Flink 1.13.1 可以启用 unaligned checkpoint。在背压严重时，它不等待所有 channel 完成传统对齐，而是把 in-flight data 也纳入 checkpoint。这样能够缩短 barrier 对齐等待，让 checkpoint 更有机会在超时前完成。

代价也在监控字段里：unaligned checkpoint 会出现 Persisted in-flight data，异步阶段还包括等待最后 barrier 和持久化这些数据的时间。网络中积压的数据越多，checkpoint 体积与恢复时需要重放的内容就越多。

因此我把 unaligned 当作容错策略，不把它当吞吐优化。sink 写不动、热点 key、CPU 不足这些根因仍然存在。开启前要用相同负载做对照，至少记录 checkpoint 成功率、端到端耗时、持久化 in-flight data、存储写入量和一次故障恢复耗时。

Flink 1.13.1 的中文配置文档仍把这个功能标为实验性。生产启用时，还要确认作业拓扑、版本与升级路径，不适合只因为一次 checkpoint 超时就在所有任务上全局打开。

## Timeout 只决定等多久，不决定为什么慢

`setCheckpointTimeout()` 控制一轮 checkpoint 最多等待多久；`setMinPauseBetweenCheckpoints()` 控制成功完成后至少暂停多久；`setMaxConcurrentCheckpoints()` 决定允许多少轮同时进行。三个参数解决的不是同一件事。

状态确实较大、但耗时稳定时，可以给 timeout 留出合理余量。若 duration 随流量持续上升，单纯放大 timeout 只会让失败晚一点发生。并发 checkpoint 能提高触发机会，也会增加状态后端和存储并发，IO 已经拥塞时可能更糟。最小暂停时间则能避免作业刚完成一轮，马上又进入下一轮快照。

我一般先做一组单变量实验：固定业务输入，保留一轮 checkpoint 并设置最小暂停；定位瓶颈段后，只调整对应的算子并行度、外部 sink 能力、状态分布或 checkpoint 模式。每次实验都记录同一组分位数，不用“这次看起来快了”做结论。

一次 checkpoint 超时可以由很多路径产生。把四段时间拆开后，结论会具体得多：barrier 在到达某个算子之前堵住，某路输入没有对齐，主线程快照太慢，或者状态文件没有及时写完。只有这种结论，才能对应到一个可以验证的修改。

## 对照源码与文档

- [Flink 1.13.1 Checkpoint 监控：端到端耗时与 in-flight data](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/ops/monitoring/checkpoint_monitoring.md#L70-L87)
- [`SingleCheckpointBarrierHandler.processBarrier()`：第一个与最后一个 barrier 的处理边界](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/flink-streaming-java/src/main/java/org/apache/flink/streaming/runtime/io/checkpointing/SingleCheckpointBarrierHandler.java#L193-L241)
- [`SingleCheckpointBarrierHandler`：alignment timeout 的状态切换](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/flink-streaming-java/src/main/java/org/apache/flink/streaming/runtime/io/checkpointing/SingleCheckpointBarrierHandler.java#L278-L300)
- [Flink 1.13.1 背压监控：采样方式与 HIGH 阈值](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/ops/monitoring/back_pressure.md#L50-L58)
- [Flink 1.13.1 Checkpoint 配置：pause、timeout、并发与 unaligned](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/dev/datastream/fault-tolerance/checkpointing.md#L84-L102)
- [Flink 1.13.1 tag 对应提交](https://github.com/apache/flink/releases/tag/release-1.13.1)
