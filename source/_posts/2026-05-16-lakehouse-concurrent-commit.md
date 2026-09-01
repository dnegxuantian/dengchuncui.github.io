---
title: "湖仓并发写入为什么要从提交冲突诊断：重试不是统一答案"
date: "2026-05-16 08:37:27"
updated: "2026-05-16 08:37:27"
categories:
- "湖仓架构"
tags:
- "Apache Iceberg"
- "并发提交"
- "故障诊断"
description: "从 Iceberg 乐观并发提交链路分析 append、overwrite、row-level operation 与表维护冲突，区分可重试提交失败、语义冲突和未知结果。"
cover: /images/articles/lakehouse-concurrent-commit.svg
top_img: /images/articles/lakehouse-concurrent-commit.svg
permalink: /2026/05/16/lakehouse-concurrent-commit/
comments: false
editorial_standard: expert-v1
---

湖仓写任务报 `CommitFailed`，最常见的处理是调高重试次数。这对一部分并发 append 有效，对 overwrite、delete 或 compaction 却可能掩盖真正的语义冲突。更麻烦的是提交超时：客户端认为失败，Catalog 可能已经成功切换了元数据。

诊断并发写入，不能只看异常类名。我会把一次写拆成数据文件生成、基于某个 snapshot 规划变更、冲突校验、Catalog 原子提交和提交结果确认五段，先判断失败发生在哪一段，再决定复用文件、重新规划还是人工核对。

![Iceberg 并发提交诊断路径](/images/articles/lakehouse-concurrent-commit.svg)

<!-- more -->

## 乐观并发保护的是元数据提交

Iceberg writer 从基准 snapshot/metadata version 出发，写出 data/delete files 与 manifest，再构造新 metadata，最后通过 Catalog 的 compare-and-swap 原子更新当前指针。两个 writer 可以并行准备，只有提交点需要竞争。

这意味着“发生并发”并不必然失败。纯 append 通常可以在刷新表状态后复用已写文件，把新增 manifest 重新挂到最新元数据树上。重试成本远低于重跑整个计算任务，这也是提交层重试值得存在的地方。

但原子指针只防止静默覆盖，不自动证明业务语义仍成立。Writer 基于 snapshot S 计算“覆盖日期 D”，期间另一个 writer 已修改 D；如果无条件把旧计划重放到新 snapshot，可能删除对方刚写入的数据。

因此日志至少保留 table identifier、branch、base snapshot/metadata location、operation type、isolation、conflict filter、new/deleted file counts、attempt、commit UUID 与 Catalog request ID。只有一句“版本不一致”无法判断哪些数据相交。

## 先区分四种冲突

第一种是 Catalog compare-and-swap 竞争。当前元数据指针被别人推进，但你的语义校验仍可能成立。这类错误刷新表后重建元数据并有限重试，常见于并发 append。

第二种是 validation conflict。Overwrite/Delete/RowDelta 所依赖的数据范围已经变化，例如冲突 filter 内出现新 data file 或原计划删除的文件不再有效。这不是基础设施瞬断，而是旧假设被并发写破坏。需要重新读取新 snapshot、重新计算或让上层决定合并语义。

第三种是 commit state unknown。Catalog 请求超时、连接断开或服务端在响应前重启，客户端不知道提交是否成功。此时直接用新 commit UUID 再写，可能重复数据。先按 commit UUID、snapshot summary、metadata location 查询，确认成功、未发生或仍不可判定。

第四种是数据文件阶段失败。写出的文件未进入任何 snapshot，可能形成 orphan；它与元数据并发冲突不是一回事。重试前要知道文件是否可复用、是否被其他提交引用，清理由保守保留期的 orphan 任务处理，不能现场随手删除。

## Operation 类型决定验证条件

Append 通常只要求不覆盖已有文件，竞争后可把新增文件并入最新状态。但同一业务批次若重复执行，Iceberg 不会替业务自动去重。应用仍需要 batch/job ID、源 offset 或业务唯一键来识别重复提交。

Dynamic overwrite 按写入结果涉及的分区替换，期间新增到相同分区的数据可能与原意冲突；static overwrite 的范围更大，风险也更高。提交日志必须留实际 conflict filter，不要只写 `INSERT OVERWRITE`。

Merge/Delete/Update 依赖扫描到的 data/delete files。并发 append 是否冲突与 isolation level、过滤范围和 validator 有关。重试若重新扫描，得到的结果可能改变；这应被视为新的 planning attempt，而不是透明网络重试。

Compaction 虽然主要重写文件，也是一位 writer。它要确认准备替换的源文件仍存在，并避免与业务 overwrite/delete 互相破坏。把 compaction 当纯后台 IO，不设并发预算和冲突策略，会在高峰期持续抢提交。

## 重试策略要看是否取得新事实

提交层重试包含 refresh、validate、rebase/build metadata、commit，并使用指数退避和抖动。每次 attempt 记录 base/current snapshot 差异。如果当前状态没变化而相同错误重复，继续重试通常没有价值。

语义冲突不能靠把重试次数从 4 调成 100。重新规划前，作业要确认源输入是否可重放、写入文件是否能安全回收、业务时间窗是否仍有效。流式 sink 还要结合 checkpoint ID，避免恢复时重复提交已完成 checkpoint。

unknown state 的恢复优先 reconciliation：扫描近期 snapshots 的 summary/commit token，检查文件集合和业务批次标识。确认已提交就把本地状态推进；确认未提交才重试；证据仍不够，暂停同批次写入并告警。

提交退避不能无限占用集群资源。大量 writer 同时刷新和重试会形成提交风暴。按表/分区限制并发，maintenance 与业务写分配窗口，监控 attempts per commit、validation failure、unknown duration 和 commit latency。

## 用时间线还原现场

我排查时先列表 snapshot 时间线：每次提交的 operation、parent、summary、files、writer/job/checkpoint。再把失败 writer 的 base snapshot 和 conflict filter 叠上去，看在它规划后到底插入了哪些提交。

如果所有失败都集中在一个 Catalog，检查 CAS/锁实现、元数据可见性和对象存储一致性；如果只发生在相同分区的 overwrite，先看业务并发编排；如果 compaction 开启后陡增，看 rewrite group 与业务写的重叠。

修复验证用两个受控 writer 制造确定冲突：并发 append 应有限重试成功且无重复；同范围 overwrite 应按策略拒绝或重算；提交响应丢失后应通过 commit token 找到结果；compaction 与 delete 不得复活已删除行。

还要验证读结果，而不只是两个任务都显示成功。按业务主键/批次、snapshot 增量和文件引用核对，并确认没有未引用文件被过早删除。

湖仓的原子提交解决了“不能把彼此的元数据静默覆盖”，没有替业务定义所有并发语义。把冲突类型、操作假设和提交状态查清楚，重试才是恢复机制；否则它只是把竞态再执行几遍。

## 对照资料

- [Apache Iceberg Reliability：并发写与乐观并发](https://iceberg.apache.org/docs/1.8.0/reliability/)
- [Apache Iceberg Spec：Table Metadata](https://iceberg.apache.org/spec/#table-metadata)
- [Apache Iceberg Spark Writes：Isolation Level 与写操作](https://iceberg.apache.org/docs/latest/spark-writes/)
- [AWS Builders' Library：Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
