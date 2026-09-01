---
title: "Flink SQL 调优为什么先看 EXPLAIN：Join、Exchange 与 Changelog 的代价"
date: "2022-04-26 08:25:24"
updated: "2022-04-26 08:25:24"
categories:
- "实时计算"
tags:
- "Flink SQL"
- "执行计划"
- "性能诊断"
description: "基于 Apache Flink 1.14.4 的 EXPLAIN 能力与 Planner 源码，说明如何从物理节点、Exchange、Join 策略和 Changelog Mode 定位 SQL 作业成本。"
cover: /images/articles/flink-sql-plan-first.svg
top_img: /images/articles/flink-sql-plan-first.svg
permalink: /2022/04/26/flink-sql-plan-first/
comments: false
editorial_standard: expert-v1
---

Flink SQL 作业变慢后，最常见的动作是加并行度、调 managed memory、扩大 checkpoint timeout。这样有时能缓解问题，但也容易把一份错误的物理计划跑得更贵。

我接手一条 SQL 时，第一份材料不是 Web UI 截图，而是当时 Catalog、配置和 SQL 共同生成的 `EXPLAIN`。SQL 只是意图，真正消耗网络、状态和 CPU 的是优化后的物理节点。Join 选了广播还是 shuffle、聚合有没有两阶段、哪条边产生 Exchange、输出是 append 还是 retract，这些决定比一个笼统的“数据量大”更接近根因。

![Flink SQL 从计划到运行证据的诊断链路](/images/articles/flink-sql-plan-first.svg)

<!-- more -->

## 一条 SQL 至少要看三层结果

Flink 1.14.4 的 `EXPLAIN` 会展示抽象语法树、优化后的物理计划以及物理执行计划。`EXPLAIN ESTIMATED_COST, CHANGELOG_MODE, JSON_EXECUTION_PLAN` 还能附带估算成本、每个物理节点的 changelog mode 和 JSON 执行图。

抽象语法层适合确认字段解析、过滤条件和 Join 条件有没有被正确识别。比如本来写的是等值 Join，隐式类型转换却让条件变得复杂；或者一个 UDF 包住分区字段，使 filter 无法下推。这些问题在运行指标里只表现为“输入很多”，计划却能看到过滤还停在上层。

优化后的物理计划是调优的重点。它已经选择了 operator、数据交换方式和聚合阶段。看到 `Exchange`，就要问数据为什么需要按 key 重新分区；看到 BroadcastHashJoin，就要验证 build side 估算是否可信；看到单阶段聚合，就要查局部预聚合为何没有生效。

JSON execution plan 更接近最终作业图，可以用来做版本间 diff。但我不会只保存一张截图。发布平台应该保存 SQL hash、Catalog snapshot、TableConfig、Flink 版本与原始 explain text；否则两次计划不同，到底是 SQL 改了、统计信息变了，还是默认配置变化，事后无法判断。

## Join 慢，先确认数据移动方式

批 SQL 的 Hash Join 常见两条路径：BroadcastHashJoin 把较小一侧发送到每个并行实例，ShuffleHashJoin 则按 Join key 重分区两侧数据。Flink 的 `BatchPhysicalHashJoinRule` 会结合可用 operator 与成本判断是否广播。

广播不是“没有 shuffle”。小表仍然要传到每个下游实例，总代价约等于小表大小乘下游并行度。统计信息低估时，一张实际数 GB 的表可能被广播到几十个 TaskManager，网络与内存同时被击穿。只把 broadcast threshold 调小，可能又把所有任务推向双边 shuffle。

我会从计划里记录 build/probe side、estimated row count、selected join strategy 和 Exchange distribution，再用运行指标核对真实 input bytes、records、spill 与 busy time。估算和运行差一个数量级时，先修统计信息或数据分布认知，不急着调 operator 参数。

流 Join 还要看时间边界。Regular Join 会保留两侧历史状态，状态大小取决于 key 基数和输入累积，不是简单的每秒吞吐。Interval Join、Temporal Join 和 Lookup Join 的状态语义不同。SQL 都写成 `JOIN`，计划里的 operator 才告诉我系统准备怎样保存与匹配数据。

## Exchange 往往是数据倾斜暴露的位置

一个 `GROUP BY tenant_id` 必须让相同 key 到同一并行实例。计划里的 hash Exchange 是语义要求，不是可以随手删掉的多余步骤。真正要查的是 key 分布是否让某个分区承受了大部分数据。

只看作业整体吞吐会掩盖倾斜。平均每个 subtask 处理一百万行，可能实际是一个 subtask 处理八百万，其他七个几乎空闲。计划告诉我哪条边按什么字段分区，运行指标再验证各 subtask 的 records、bytes、busy/backpressure 是否分散。

倾斜治理也要回到语义。加盐后做两阶段聚合适合可结合的 SUM/COUNT，却不能无条件套到所有 UDAF。热点 key 拆分后再合并，会改变 distinct、topN 或顺序敏感函数的成本。先从计划判断是否已有 local/global 两阶段，再决定是否改 SQL。

Flink 的 planner 会在条件允许时生成两阶段聚合；流作业的 mini-batch 也能减少状态访问，但它引入允许延迟，并且需要同时设置 enabled、allow-latency 和 size。把 mini-batch 当成“性能开关”开启，却不确认下游时效 SLA，是用语义换吞吐而没有登记代价。

## Changelog Mode 决定下游收到什么

流式 SQL 的结果不一定只追加。聚合值随新数据变化时，operator 可能输出 update-before、update-after；某些 Join 和去重还会产生 delete。`EXPLAIN CHANGELOG_MODE` 能把每个物理节点的 `I / UB / UA / D` 组合展示出来。

这项信息对 sink 很关键。下游 Kafka append topic 收到更新流，如果没有主键和 upsert 语义，就会把同一业务结果保存多份。JDBC sink 即使支持 upsert，主键选择不当也可能造成热点锁。作业运行成功不代表最终表语义正确。

我会沿计划从 source 往 sink 看 changelog 如何变化：哪个聚合第一次产生更新，哪个节点做了 normalize，sink 声明接受什么模式。若 planner 为适配 sink 插入额外物化或 normalize，状态和网络成本也应该进入评估。

这一步还能发现“为什么换个 sink 计划就变了”。Flink 优化的是从 source 到 sink 的整体 DAG，sink ability 与 changelog 要求会反向影响上游。只拿 `SELECT` 单独 explain，有时与真实 `INSERT INTO` 的计划不同，生产诊断应 explain 完整 DML。

## Cost 是估算，不是运行事实

`ESTIMATED_COST` 输出 row count、CPU、IO 和 network 等估算，用来解释优化器为什么在候选计划中做出选择。它不是对生产耗时的承诺。缺少统计信息时，估算值可能来自默认规则；流式无界数据也不能像有限批次那样得出最终行数。

因此我会同时保留 plan evidence 与 runtime evidence：

```text
计划：节点类型、估算行数、distribution、changelog、并行度
运行：输入输出记录、bytes、busy/idle/backpressure、state、checkpoint
```

两者一致时，计划能解释瓶颈。例如 hash Exchange 后一个 subtask 长期 busy，key 分布也高度倾斜。两者不一致时，差异本身就是线索：估算小表实际很大，说明统计信息过期；计划认为 filter 可下推但 source 读取量没降，说明 connector 没有真正执行下推或谓词不被支持。

不要用运行时偶然正常来证明计划合理。低峰期一条全量 shuffle SQL也可能按时完成，数据翻倍后才暴露。计划 review 的价值在发布前发现成本结构，而不是出故障后补一张图。

## 我会怎样做一次计划级调优

第一步固定输入：SQL 文本、DDL、Catalog 对象版本、统计信息、所有 `table.*` 配置和 Flink 构建版本。没有同一份输入，前后计划不可比。

第二步用完整 `INSERT` 生成带 `ESTIMATED_COST`、`CHANGELOG_MODE` 的 explain，逐节点标记 source pruning、filter/project pushdown、Exchange、Join、Aggregate、Rank、Normalize 和 sink。

第三步形成一个明确假设。例如“维表统计过期导致错误广播”，而不是“内存可能不足”。修改一项配置、统计或 SQL 后重新生成计划，确认目标节点确实变化。

第四步才在可控数据集上运行，对照 records、bytes、state 和 checkpoint。吞吐提高但 changelog 变了，或者结果校验不一致，都不能算优化成功。

最后把 explain diff 与运行结果一起进入发布记录。Flink SQL 的性能问题经常跨 planner、runtime 和业务数据分布三层，计划是把它们串起来的第一张地图。先读地图，再加机器，排障会少很多试错。

## 对照源码与文档

- [Flink 1.14.4 EXPLAIN 文档：逻辑计划、物理计划与详细选项](https://github.com/apache/flink/blob/895c60940a8a7c95bef1ebe9f92c0baf168be145/docs/content/docs/dev/table/sql/explain.md#L27-L60)
- [Flink 1.14.4 EXPLAIN：ESTIMATED_COST、CHANGELOG_MODE 与 JSON_EXECUTION_PLAN](https://github.com/apache/flink/blob/895c60940a8a7c95bef1ebe9f92c0baf168be145/docs/content/docs/dev/table/sql/explain.md#L275-L288)
- [`StreamPlanner.explain()`：根据 ExplainDetail 生成成本、Changelog 与 JSON 计划](https://github.com/apache/flink/blob/895c60940a8a7c95bef1ebe9f92c0baf168be145/flink-table/flink-table-planner/src/main/scala/org/apache/flink/table/planner/delegation/StreamPlanner.scala#L116-L174)
- [`BatchPhysicalHashJoinRule`：Broadcast 与 Shuffle Hash Join 的物理规则](https://github.com/apache/flink/blob/895c60940a8a7c95bef1ebe9f92c0baf168be145/flink-table/flink-table-planner/src/main/scala/org/apache/flink/table/planner/plan/rules/physical/batch/BatchPhysicalHashJoinRule.scala#L43-L72)
- [`ExecutionConfigOptions`：mini-batch 开启条件与延迟、大小配置](https://github.com/apache/flink/blob/895c60940a8a7c95bef1ebe9f92c0baf168be145/flink-table/flink-table-api-java/src/main/java/org/apache/flink/table/api/config/ExecutionConfigOptions.java#L294-L329)
