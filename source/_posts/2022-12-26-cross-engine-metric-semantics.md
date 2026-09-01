---
title: "Spark、Flink、YARN 指标怎么统一：先统一语义，不要先统一名字"
date: "2022-12-26 16:59:20"
updated: "2022-12-26 16:59:20"
categories:
- "平台稳定性"
tags:
- "可观测性"
- "Apache Spark"
- "Apache Flink"
- "Apache YARN"
description: "结合 Spark 3.3.1、Flink 1.15.3 与 Hadoop YARN 3.3.4 的指标定义，说明跨引擎指标平台如何处理单位、窗口、聚合、身份和可比性。"
cover: /images/articles/cross-engine-metric-semantics.svg
top_img: /images/articles/cross-engine-metric-semantics.svg
permalink: /2022/12/26/cross-engine-metric-semantics/
comments: false
editorial_standard: expert-v1
---

数据平台接入 Spark、Flink 和 YARN 指标后，通常很快会建出一张“统一监控大盘”。最常见的统一方式，是把包含 CPU 的字段都改名为 `cpu_usage`，包含 records 的都改成 `throughput`。图表变整齐了，数值却失去原义：一个是累计 CPU 时间，一个是滑动窗口忙碌时长，另一个甚至只是调度器分配的 vcore-seconds。

我做跨引擎可观测时，不追求让所有指标长得一样。先保存原始指标和完整语义，再挑出真正可比较的业务事实。统一名字只能解决查询方便，统一口径才可能支撑诊断。

![跨引擎指标先保留原义，再形成可比口径](/images/articles/cross-engine-metric-semantics.svg)

<!-- more -->

## 一个指标至少有七个维度

指标名只是入口。一条可以被正确使用的指标，至少要说明：单位、类型、采集范围、时间窗口、聚合方式、重置条件和版本。

例如 `records_in` 是 Counter 还是 Meter？表示本次 Task 累计值，还是最近几秒每秒平均值？同一个 operator 有 64 个 subtasks 时，页面显示 sum、max 还是 average？作业恢复后计数是否清零？这些信息缺一个，告警规则就可能换一个引擎便失效。

我会把原始数据存成类似下面的契约：

```text
metric_name: flink.task.numRecordsInPerSecond
unit: records/second
kind: meter
scope: operator_subtask
window: engine_defined_recent_window
aggregation: raw
reset: task_attempt_restart
engine_version: 1.15.3
```

字段路径中保留 engine 和版本，不用平台统一名覆盖。语义层再把它映射为候选的 `record_rate`，并记录能否跨引擎比较。源定义变化时，只新增映射版本，历史报表仍按当时口径解释。

## Spark 的 executorRunTime 不是 CPU 时间

Spark 3.3.1 `TaskMetrics` 同时提供 `executorRunTime` 和 `executorCpuTime`。官方监控文档把前者定义为 executor 花在运行这个 Task 上的毫秒数，包含从 driver 取结果的时间；后者是 executor 执行 Task 消耗的 CPU 时间，单位是纳秒。

只看名字就把二者都换算成“CPU 使用率”，会犯两个错误。第一，单位不同；第二，run time 是墙钟维度，CPU time 是累计处理器时间。多线程、本地等待、GC 和 IO 都会让它们的关系变化。可以在限制明确的场景下计算 `cpu_time / run_time` 作为效率线索，但不能把它当操作系统 CPU utilization 的直接替代。

Spark 的输入还分 `inputMetrics` 与 `shuffleReadMetrics`。前者的 bytes/records 描述外部输入，后者描述 stage 之间的 shuffle 读取。把两者相加命名为“扫描量”，会把同一份数据在多个 stage 的内部交换重复计入。做存储扫描优化应看 input；诊断网络和数据倾斜则看 shuffle，不能共用一个阈值。

`memoryBytesSpilled` 与 `diskBytesSpilled` 也不是当前内存和磁盘占用。它们表示 spill 过程中的累计量，同一批对象从内存估算后落盘，两个数字不适合简单相加成“总 spill 空间”。我会保留两条曲线，再结合 Task 分位数、GC time 和 shuffle fetch wait 判断瓶颈。

## Flink 的 busy 与 back pressure 是窗口状态

Flink 1.15.3 为每个 subtask 暴露 idle、busy 和 back pressured time per second。官方文档说明，这三个值在任一时刻约合计 1000ms，按最近几秒更新。一个持续 50% 负载的 subtask，与一秒全忙、一秒空闲交替的 subtask，都可能显示约 500ms busy time。

因此 `busyTimeMsPerSecond=900` 不能和 Spark `executorCpuTime` 直接对比。它表达的是一个短窗口内 operator 是否忙于实际工作，不是进程消耗了多少 CPU。back pressure 又由输出 buffer 可用性判断，表示下游消费跟不上导致上游受压，并非“CPU 反压率”。

聚合规则同样会改变结论。Flink Web UI 对 JobGraph 展示的是 subtasks 的最大 back pressure 和 busy 值。max 适合发现最严重的瓶颈，但不能代表整个 operator 的平均负载。若平台采集后改成 average，单个热点 subtask 会被 63 个空闲 subtask 稀释；若用 sum，又会超过 1000ms 而失去比例含义。

我会同时保留 max、p50、p95 和每个 subtask 原值。诊断反压看 max/p95 与拓扑传播方向；做容量趋势看各 subtask busy 的分布；判断吞吐看 numRecordsIn/Out，但要先确认记录在算子内是否展开、过滤或聚合。records 并不是跨 SQL 都相同的业务行。

## YARN 的 resource-seconds 是容量账，不是利用率

Hadoop YARN 3.3.4 的 `ApplicationResourceUsageReport` 定义 memory-seconds 和 vcore-seconds：已分配的内存 MB 或 vcores 乘以运行秒数。一个应用申请 8 vcores、运行 600 秒，即使多数时间等待外部存储，也会积累 4800 vcore-seconds。

这类指标适合做队列容量与成本归因，因为调度器确实把资源份额留给了应用；它不回答 CPU 实际忙了多久。拿 YARN vcore-seconds 除以作业 wall time，再与 Spark CPU time 比较，会把 request 与 usage 混在一起。

平台需要并存两套事实：allocated 用于容量、配额和成本，actual 用于效率与性能。Kubernetes 的 requests/limits/usage 也是同样的关系。统一指标层若只留一个 `cpu`，后续既无法还原计费，也无法判断过度申请。

资源累积值还要绑定 application attempt。任务重试提交了三个 YARN applications，只展示最后成功的 resource-seconds，会把两次失败成本抹掉；直接按 job_id 汇总又可能混入并发补数。身份至少要对齐到 `job_instance_id + attempt + engine_application_id`。

## 跨引擎真正可比的是业务分母

引擎内部指标最适合内部诊断：Spark 的 shuffle/spill，Flink 的 back pressure/watermark，YARN 的 allocated resources。跨引擎比较应尽量回到业务上等价的事实，例如处理相同输入快照、产出相同结果约束时：

```text
端到端完成时间
每 GB 有效输入的 allocated vcore-seconds
每百万有效输出行的计算与存储成本
失败重试成本
SLA 达成率
发布后质量检查结果
```

这里每个分母都要定义。输入 bytes 是压缩前还是存储读取量？输出 rows 是 sink 收到的记录，还是去重后提交的业务行？流任务没有自然结束时间，就按固定业务窗口计算，并标明窗口完整性和 watermark 截止点。

我不会做一个笼统的“引擎性能排行榜”。同一 SQL 在不同执行计划、并行度、文件布局、缓存和数据分布下，跑分没有迁移意义。对比实验要固定输入快照、代码、资源上限、并行度策略和冷/热缓存条件，至少重复多次，再解释差异来自哪里。

## 缺失值与晚到值不能自动填零

监控采集中断时，零表示真实没有发生，null 表示不知道。Flink busy time 可能因无法计算返回 NaN；Spark application 结束前的最后一批 TaskMetrics 可能晚到；YARN application 被快速清理后也可能拿不到最终 report。全部填零会让故障期间的利用率显得异常健康。

每个点应带 `event_time`、`observed_at`、`completeness` 和 source status。累计 Counter 出现下降，先判断 attempt 重启或 exporter reset，再计算 rate；Gauge 可按短窗口保留最后值，但超出 freshness TTL 后必须标 stale。报表需要展示覆盖率，告警计算也要区分“超过阈值”和“指标缺失”。

平台自己的派生指标要可回放。映射规则、聚合窗口和单位转换写成版本化配置，用保存的 raw metrics 重算；不能只落最终宽表。一次引擎升级后曲线突变时，我们才有办法判断是工作负载变化，还是指标定义/采集路径变化。

跨引擎指标统一的价值，不是把不同系统压成一套漂亮字段，而是让使用者知道哪些数可以比较、哪些只能在引擎内解释。保留原义、绑定身份、声明窗口和聚合，再从业务分母生成派生事实，监控才不会在最需要它时给出错误方向。

## 对照源码与文档

- [Apache Spark 3.3.1：TaskMetrics 中 executor run/cpu time、spill、input 与 shuffle 指标](https://github.com/apache/spark/blob/fbbcf9434ac070dd4ced4fb9efe32899c6db12a9/core/src/main/scala/org/apache/spark/executor/TaskMetrics.scala#L42-L104)
- [Apache Spark 3.3.1：监控文档对 executorRunTime、executorCpuTime 及单位的定义](https://github.com/apache/spark/blob/fbbcf9434ac070dd4ced4fb9efe32899c6db12a9/docs/monitoring.md#L637-L699)
- [Apache Flink 1.15.3：back pressure、idle 与 busy 的窗口和聚合语义](https://github.com/apache/flink/blob/c41c8e5cfab683da8135d6c822693ef851d6e2b7/docs/content/docs/ops/monitoring/back_pressure.md#L35-L78)
- [Apache Flink 1.15.3：Task/Operator records 与 time-per-second 指标定义](https://github.com/apache/flink/blob/c41c8e5cfab683da8135d6c822693ef851d6e2b7/docs/content/docs/ops/metrics.md#L1476-L1552)
- [Apache Hadoop 3.3.4：memory-seconds 与 vcore-seconds 是资源分配量乘运行秒数](https://github.com/apache/hadoop/blob/a585a73c3e02ac62350c136643a5e7f6095a3dbb/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-api/src/main/java/org/apache/hadoop/yarn/api/records/ApplicationResourceUsageReport.java#L125-L159)
