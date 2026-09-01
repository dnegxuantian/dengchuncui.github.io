---
title: "批处理和流处理为什么算不出同一个数：先统一数据边界与 Changelog 语义"
date: "2021-09-19 11:53:18"
updated: "2021-09-19 11:53:18"
categories:
- "数据架构"
tags:
- "批流一致性"
- "Flink SQL"
- "数据口径"
description: "从 Flink 1.13.1 动态表、事件时间、Kafka offset 与 Upsert Changelog 语义出发，说明批流对账应怎样统一输入边界、时间和结果形态。"
cover: /images/articles/batch-stream-consistency.svg
top_img: /images/articles/batch-stream-consistency.svg
permalink: /2021/09/19/batch-stream-consistency/
comments: false
editorial_standard: expert-v1
---

同一段 SQL，离线任务算出的订单金额是 1000 万，实时看板是 998 万。很多团队会先对 SQL 文本，确认 join、filter、group by 看起来一致，然后把差异归因成“实时有延迟”。

SQL 一致只是最表面的一层。批处理读的是一个有界快照，流处理消费的是持续变化的 changelog；两边如果没有停在同一个数据边界上，就连应该相等的时刻都没有定义。再叠加事件时间、watermark、迟到数据、UPDATE/DELETE 和 sink 主键，数值不同反而是正常结果。

Flink 1.13.1 的动态表文档有一句很重要的话：连续查询在任意时刻的结果，语义上等价于在输入表快照上执行同一批查询。这个“输入表快照”就是批流对账需要构造的参照物，而不是墙上时间写着几点。

![批流对账必须统一的四层边界](/images/articles/batch-stream-consistency.svg)

<!-- more -->

## 先定义两边停在哪一批数据

假设 10:00 发起离线查询，同时去实时库读一个结果。离线任务扫描需要 20 分钟，源表在这段时间仍有新数据；实时任务也在不断消费。即使两份 SQL 完全相同，双方读取的输入集合也不相同。

可靠的边界应该能枚举、能保存、能重放。Kafka source 最直接的边界是每个 partition 的 offset 集合：

```text
topic=orders
partition-0: [start=0, end=148230)
partition-1: [start=0, end=153991)
partition-2: [start=0, end=146008)
```

对账用的流结果要明确已经处理并提交到这一组 end offset。离线回放也只读取相同的 offset 区间。这样“同一批输入”才有可验证含义。

用 `2021-09-19 10:00:00` 作为边界弱一些。Kafka 支持按 timestamp 找每个 partition 的起始位置，但 timestamp 最终仍会映射为各 partition 的 offset，而且 CreateTime、LogAppendTime 与业务事件时间不是同一个概念。时钟偏差、生产端重试和跨 partition 顺序都可能让同一个时间值对应不同输入。

如果批数据来自 Hive 分区、流数据来自 Kafka，还需要在采集层建立映射：某个离线快照包含到哪些 source offset 或 Binlog position。没有这份映射，离线分区 `dt=2021-09-19` 和实时“截至 9 月 19 日”的口径只是名字相似。

## Processing Time 无法作为可复算口径

Flink 把处理时间定义为机器执行操作时的本地时间。它使用方便，不需要从记录提取时间，也不需要 watermark，但官方文档明确指出它不能提供确定性。

同一批事件今天回放一次，机器速度、并行度和调度时机都可能不同，记录落入的 processing-time window 会变化。离线 SQL 往往按业务字段 `pay_time` 分组，实时 SQL 却按 `PROCTIME()` 开窗，两份结果天然没有逐窗口相等的保证。

需要批流复算时，我会使用事件时间。事件时间来自数据本身，Flink 文档说明它在乱序和迟到场景下可以产生一致、可重放的结果；流式作业中的 event-time attribute，在批作业中就是普通时间字段。这给两种执行模式提供了共同坐标。

但把字段都改名为 `event_time` 仍然不够，还要统一：

- 时间字段取业务发生、数据库提交还是进入消息队列的时间；
- 字段使用 UTC、Asia/Shanghai 还是无时区 timestamp；
- 窗口是左闭右开还是其他边界；
- watermark 允许多大乱序；
- watermark 之后到达的数据是丢弃、侧输出还是触发修正；
- 补数是否沿用原 event time。

其中任何一个不同，日窗口边界和最终数据集合都会变化。对账文档里只写“按天统计”，没有办法复现。

## 流 SQL 输出的是变化，不一定是一行最终值

批查询结束时返回一张静态结果表。流式 `GROUP BY` 是连续查询，输入每来一条记录，结果表可能 INSERT，也可能 UPDATE 以前的聚合值。

Flink 动态表把这种变化编码成 append、retract 或 upsert changelog。非窗口的用户计数会持续更新；如果 sink 只支持 append，把每次中间结果都当成一条最终记录，目标表里就会同时出现 count=1、2、3。离线表每个用户只有一行，双方当然对不上。

Upsert sink 需要稳定的唯一键。Flink 1.13.1 的 upsert-kafka 根据主键把 INSERT/UPDATE_AFTER 写成普通消息，把 DELETE 写成 null value，并保证相同主键的更新进入同一 partition。消费端按 key 物化后，才得到动态表的当前状态。

这也解释了为什么“消息条数”不能直接和“离线结果行数”对账。一行聚合结果可以在 Kafka 中产生多次更新消息，但物化后仍是一行。应该比较相同边界上的 materialized state，或者按 changelog 语义重放后再比，而不是比较传输次数。

Flink 文档还说明，Upsert Kafka 在启用 checkpoint 时默认是至少一次，故障可能写出相同 key 的重复记录。因为消费端只让同一 key 的最后值生效，状态可以保持幂等。若目标端是普通 append 表，这个保证不会自动成立。

## UPDATE、DELETE 和 CDC 顺序要进入口径

批处理扫描数据库当前表，看到的是 UPDATE 与 DELETE 应用后的状态。流作业若消费 CDC，却只保留 `after` 字段并忽略 operation，可能把 UPDATE 当新增、把 DELETE 完全漏掉。

以订单状态统计为例，一笔订单从 CREATED 更新到 PAID：

```text
批表当前状态：order_id=42, status=PAID
CDC changelog：INSERT CREATED, UPDATE_BEFORE CREATED, UPDATE_AFTER PAID
```

实时聚合如果只把两条 after 记录做 count，会让 CREATED 和 PAID 各加一次；正确的动态表语义应撤回旧状态，再增加新状态。删除同理，需要从旧分组扣减。

主键变化更复杂。上游把业务主键从 A 改到 B，很多 CDC 格式会表现为旧 key 的 DELETE 与新 key 的 INSERT。下游若重新按另一个字段分区，必须保持每个结果 key 的更新顺序，否则旧值可能在新值之后到达，覆盖正确状态。

我对批流 SQL 的检查不会止于 SELECT 文本，还会比较 source 声明的 changelog mode、planner 推导出的主键、sink 接受的 RowKind，以及故障恢复后的重复处理方式。这些才决定 SQL 结果怎样落成一张可查询的表。

## Watermark 是完成判断，不是数据删除证明

事件时间作业不能永远等“也许还会来”的旧事件。Watermark 表示系统认为某个事件时间之前的数据大体已经到齐，窗口据此触发结果和清理状态。

Watermark 策略不同，会让实时结果的完成时刻和迟到处理不同。设置 5 秒乱序，不代表所有业务数据都能在 5 秒内到达；Kafka 积压、上游重试或移动端离线都可能让事件晚几个小时。离线任务第二天扫描全量分区时把这些记录算进去，实时窗口若已经关闭且不再修正，双方会形成稳定差异。

这个差异不能靠每天人工重跑解决。需要选择一个明确策略：

1. 实时层接受暂态结果，离线完成后以校准表覆盖；
2. 实时 sink 支持对已关闭窗口发修正 changelog；
3. 迟到记录进入单独数据集，按 SLA 触发可审计补偿；
4. 业务口径明确超过某个迟到阈值不再计入。

选哪一种取决于业务，但必须进入指标定义。对外只展示一个数字，又不标注“实时估算”或“已离线校准”，用户会把技术层的完成度差异理解成数据错误。

## 我会用固定边界做一轮可重放对账

一轮有效的批流对账，不是在大盘上找两个看起来接近的数字。我会保存一份运行清单：topic 与每分区 end offset、源表 snapshot/Binlog position、event time 字段和时区、watermark 策略、SQL 版本、UDF 版本、维表版本、sink 主键和 changelog mode。

然后让流任务处理到指定 offset 并完成 checkpoint，导出此时的物化结果；离线任务用同一输入边界和维表版本计算。比较时从总量逐步下钻到日期、分区、业务 key，并把差异 key 回放成事件序列。

如果同一组输入与版本能稳定复现差异，才去找算子语义或实现问题；如果每次输入边界都不同，就先修对账工具。一个不可重放的“差 2 万”只是一条告警，不是诊断证据。

批流一致性不是要求两个系统每秒钟都显示完全相同的数，而是当它们指向同一输入快照、同一时间语义和同一物化规则时，能够得到相同结果；有差异时，还能沿 offset 和 changelog 找到哪条记录改变了结果。

## 对照文档

- [Flink 1.13.1 动态表：连续查询与输入快照上的批查询语义等价](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/dev/table/concepts/dynamic_tables.md#L69-L84)
- [Flink 1.13.1 动态表：append、retract 与 upsert changelog](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/dev/table/concepts/dynamic_tables.md#L161-L179)
- [Flink 1.13.1 时间属性：processing time 不确定，event time 可重放](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/dev/table/concepts/time_attributes.md#L86-L104)
- [Flink 1.13.1 时间属性：事件时间、乱序与 watermark](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/dev/table/concepts/time_attributes.md#L221-L247)
- [Flink 1.13.1 Kafka connector：五种起始 offset 模式](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/connectors/table/kafka.md#L472-L488)
- [Flink 1.13.1 Upsert Kafka：主键顺序与 DELETE 编码](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/connectors/table/upsert-kafka.md#L29-L36)
- [Flink 1.13.1 Upsert Kafka：至少一次与物化幂等边界](https://github.com/apache/flink/blob/a7f31926eced15fa2df353b06c71b86c4f9a8e0c/docs/content.zh/docs/connectors/table/upsert-kafka.md#L241-L249)
