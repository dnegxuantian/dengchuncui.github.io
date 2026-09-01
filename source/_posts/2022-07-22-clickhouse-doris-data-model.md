---
title: "ClickHouse 与 Doris 怎么选：差别先落到数据模型，不是跑分"
date: "2022-07-22 15:50:49"
updated: "2022-07-22 15:50:49"
categories:
- "数据平台"
tags:
- "ClickHouse"
- "Apache Doris"
- "数据模型"
description: "基于 ClickHouse 22.6 MergeTree Family 与 Apache Doris 1.1 的官方语义，对比排序键、去重、聚合、更新、Rollup 和后台合并成本。"
cover: /images/articles/clickhouse-doris-data-model.svg
top_img: /images/articles/clickhouse-doris-data-model.svg
permalink: /2022/07/22/clickhouse-doris-data-model/
comments: false
editorial_standard: expert-v1
---

ClickHouse 和 Apache Doris 放在一起比较时，很容易变成架构名词和 Benchmark 数字的拉锯。一个强调 MergeTree 和本地执行，一个强调 MPP、FE/BE 和标准 SQL。对业务真正有影响的差别，往往更早发生在 `CREATE TABLE`：同一业务键来了两条数据，最终保留两条、替换一条还是聚合成一条？这个结果在什么阶段完成？

我不会先问哪个引擎快，而会先把数据分成追加明细、主键状态、可结合指标三类，再看各自的数据模型把成本放在写入、后台合并还是查询阶段。模型选错以后，硬件和参数只能缓解，无法改正语义。

![ClickHouse 与 Doris 数据模型的成本位置](/images/articles/clickhouse-doris-data-model.svg)

<!-- more -->

## ClickHouse 的 PRIMARY KEY 首先是排序与索引

MergeTree 每次写入产生新的 data part，part 内按 primary/sorting key 排序；同一 partition 的 parts 在后台合并。稀疏索引保存 granule 的 key marks，让查询按 key 范围跳过不相关数据。

这里最需要纠正的数据库直觉是：ClickHouse primary key 默认不要求唯一。官方 22.6 文档明确允许相同 primary key 的多行，后台 merge 也不保证相同 key 一定进入同一个 part。它首先服务排序、压缩和查询裁剪，不是 OLTP 数据库里的唯一约束。

所以日志事件表用普通 MergeTree 很自然。同一个 user 在同一秒产生多条事件，本来就应该全部保留。若业务是订单当前状态，直接把 `order_id` 放进 PRIMARY KEY，再多次 INSERT，不会自动得到唯一一行。

`ORDER BY` 顺序也决定可裁剪的查询前缀。`(tenant_id, event_date, order_id)` 对按 tenant + 日期查询友好，只按 order_id 查可能仍要读大量 granules。把唯一性期望和查询排序键揉成一个设计，经常顾此失彼。

## ReplacingMergeTree 是最终去重，不是实时唯一键

ReplacingMergeTree 在 parts 合并时，对相同 sorting key 保留一条；指定 `ver` 时保留最大版本。它适合后台清理重复、节省空间，但官方文档把边界说得很清楚：dedup 只在 merge 时发生，merge 的时间不可预测，不能保证查询时没有重复。

这条语义对 CDC 特别关键。上游同一订单先写 version 10，又写 version 11，在相关 parts 尚未合并前，普通查询可能看到两行。查询可以使用 `FINAL` 获取合并后的视图，但这会把额外合并工作放到读时，不能给所有大范围报表无条件加上。

我会要求业务明确三件事：是否允许短时间多版本共存；查询是否都能按 `argMax(value, version)` 或同类逻辑得到最终状态；版本列能否严格单调并处理乱序。任何一项答不出来，都不能把 ReplacingMergeTree 当成“支持主键更新”。

SummingMergeTree 和 AggregatingMergeTree 也遵循类似思路：后台 merge 可以折叠数据，但查询仍应按最终聚合语义写 SQL，不能假设所有 parts 已经合成一行。后台 merge 是渐进优化，不是用户可观察结果的唯一正确性屏障。

## Doris 把模型语义写进表定义

Doris 1.1 文档把数据模型分为 Aggregate、Uniq 和 Duplicate。

Duplicate Model 完整保留导入行，`DUPLICATE KEY` 主要指定底层排序列。它对应追加明细和日志，语义上最接近普通 MergeTree：相同行可以存在，重点是利用有序存储和前缀索引加速过滤。

Aggregate Model 把列分成 Key 与 Value。相同 Key 的 Value 按 SUM、REPLACE、MAX、MIN 等聚合类型合并。Doris 会在单批导入 ETL、BE Compaction 和查询三个阶段逐步聚合；物理上可能尚未完全合并，但查询端必须呈现最终聚合结果。

Unique Model 在当时的实现里是 Aggregate + REPLACE 的特殊表达：Key 保持唯一，Value 使用 REPLACE。它更贴近“按业务主键取最新状态”的表，但 latest 的确定方式仍要看导入顺序和版本设计，不能假定网络后到的数据就是业务最新。

这种模型化做法的优势，是查询者面对一个明确的最终语义；代价是建表时就要决定哪些列属于 key、哪些值怎样聚合。一个指标原来用 SUM，后来发现需要保存每次明细或做 distinct，Aggregate Model 的物理语义可能限制后续分析。

## 去重和聚合都要问“什么时候完成”

比较两边时，我会画一条时间线：load -> visible -> background merge/compaction -> query。然后逐项标注正确性发生在哪一段。

ClickHouse ReplacingMergeTree 的后台 merge 会减少重复，但普通查询在 merge 前可能看到多版本；正确查询要显式处理版本或使用 FINAL。Doris Aggregate/Unique 允许物理聚合尚未完成，但查询阶段继续聚合，向用户返回模型定义的最终结果。

这不意味着一边一定更好。ClickHouse 把更多控制留给建表与查询设计，对高吞吐追加和可定制聚合很灵活；Doris 把模型语义和查询透明性做得更显式，数据平台更容易约束使用方式。真正的取舍是业务是否愿意在每条查询里携带最终态逻辑，以及能否接受读时成本。

测试更新模型时不能只做“插两条，等十分钟再查”。我会在后台 merge/compaction 尚未发生时立刻查询，再在后台完成后查询，检查两个时刻的业务结果是否一致；同时测批量乱序、重复投递和版本相同的冲突行。

## Rollup 与预聚合要服从查询稳定性

Doris Rollup 从 Base table 生成独立物理存储，可以保留更少列、按更粗粒度聚合，optimizer 根据查询选择合适 Rollup。Aggregate Model 上，一个按 `city` 聚合的 Rollup 能显著减少报表扫描；Duplicate Model 上，Rollup 更多用来调整列顺序与前缀索引。

ClickHouse 也有 Materialized View、Projection 和 AggregatingMergeTree 等预计算手段。两边的共同问题不是“能不能建”，而是查询维度是否足够稳定。每增加一份物化结构，都增加写入计算、存储、副本、回填和 schema 变更成本。

我通常从 Top SQL 里找覆盖率。一个候选 Rollup/Projection 能覆盖 40% 查询且指标可结合，价值明确；为了加速一条每周一次的自由分析，增加全量物化副本，多半得不偿失。上线后还要记录命中率，否则物化结构可能长期占资源却没有查询使用。

预聚合也会牺牲明细。只有 SUM 结果无法回答去重用户数变化，只有 last value 无法还原历史状态。数据模型层应保留一份可审计的明细来源，再为稳定服务场景构建聚合层，不要把唯一原始数据直接写成不可逆聚合。

## 分布键与排序键是另一组正交选择

Doris 的 Partition + Bucket 决定 Tablet 分布和查询要访问多少 buckets，Key 列又影响排序、前缀索引和模型语义。它们相关但不等价。业务主键适合 Unique Key，不代表一定是最好的 bucket key；高基数 key 能均衡分布，点查也可能裁到少量 bucket，但 Join 与热点还要单独评估。

ClickHouse 本地 MergeTree 的 ORDER BY 决定排序和稀疏索引，Distributed table 的 shard key 决定行落到哪个 shard。只优化本地 ORDER BY，却让同一业务 key 散到不同 shards，去重和聚合就要跨节点；只按业务 key 分片，又可能造成超级 tenant 热点。

因此 DDL review 我会分两张表检查：一张是 logical model，写明重复、更新、聚合语义；另一张是 physical layout，写明 partition、bucket/shard、sort key 与副本。不要用一个“主键”词覆盖所有职责。

## 我的选择方式

追加事件、查询以范围过滤和大聚合为主，团队能够严格设计 ORDER BY、shard 与最终态 SQL，我会认真评估 ClickHouse。业务大量使用标准 SQL、多表分析，主键状态与预聚合模型希望由平台统一约束，Doris 往往更容易落到数据开发流程里。

但这只是起点，不是结论。最终仍要用相同业务数据验证：写入吞吐、数据可见性、重复/乱序结果、查询 p95、后台 merge/compaction、扩容恢复和资源成本。尤其要在后台维护压力存在时跑混合负载，空闲集群的单 SQL 跑分不能代表生产。

ClickHouse 与 Doris 的差别不该被缩成“谁更快”。把一条重复数据从写入到查询的命运画出来，把一次聚合在哪几个阶段发生讲清楚，选型才真正落到了工程语义上。

## 对照源码与文档

- [ClickHouse 22.6 MergeTree：data parts、后台 merge 与 granule](https://github.com/ClickHouse/ClickHouse/blob/d5566f2f2dd7e21ed1472d8b0f33c2266ae103f8/docs/en/engines/table-engines/mergetree-family/mergetree.md#L160-L174)
- [ClickHouse 22.6 MergeTree：primary key 不要求唯一](https://github.com/ClickHouse/ClickHouse/blob/d5566f2f2dd7e21ed1472d8b0f33c2266ae103f8/docs/en/engines/table-engines/mergetree-family/mergetree.md#L176-L199)
- [ClickHouse 22.6 ReplacingMergeTree：去重只在后台 merge 发生且不保证无重复](https://github.com/ClickHouse/ClickHouse/blob/d5566f2f2dd7e21ed1472d8b0f33c2266ae103f8/docs/en/engines/table-engines/mergetree-family/replacingmergetree.md#L6-L12)
- [ClickHouse 22.6 ReplacingMergeTree：sorting key 与 version 的保留规则](https://github.com/ClickHouse/ClickHouse/blob/d5566f2f2dd7e21ed1472d8b0f33c2266ae103f8/docs/en/engines/table-engines/mergetree-family/replacingmergetree.md#L32-L43)
- [Apache Doris 1.1：Aggregate Model 的 Key/Value 与聚合类型](https://github.com/apache/doris/blob/a6eb47ac0875ed51291ed7b1cd990d40f7d901de/docs/en/getting-started/data-model-rollup.md#L35-L96)
- [Apache Doris 1.1：导入、Compaction、查询三个聚合阶段](https://github.com/apache/doris/blob/a6eb47ac0875ed51291ed7b1cd990d40f7d901de/docs/en/getting-started/data-model-rollup.md#L225-L237)
- [Apache Doris 1.1：Unique 与 Duplicate Model 的语义](https://github.com/apache/doris/blob/a6eb47ac0875ed51291ed7b1cd990d40f7d901de/docs/en/getting-started/data-model-rollup.md#L235-L334)
- [Apache Doris 1.1：Rollup 物理存储与查询命中](https://github.com/apache/doris/blob/a6eb47ac0875ed51291ed7b1cd990d40f7d901de/docs/en/getting-started/data-model-rollup.md#L336-L404)
