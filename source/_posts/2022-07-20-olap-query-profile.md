---
title: "OLAP 引擎怎么选：先把查询画像写出来，再跑 Benchmark"
date: "2022-07-20 22:09:48"
updated: "2022-07-20 22:09:48"
categories:
- "数据平台"
tags:
- "OLAP"
- "ClickHouse"
- "Apache Doris"
description: "结合 ClickHouse 22.6 与 Apache Doris 1.1 的存储组织，说明 OLAP 选型前如何从真实 SQL 建立过滤、聚合、Join、并发、新鲜度和成本画像。"
cover: /images/articles/olap-query-profile.svg
top_img: /images/articles/olap-query-profile.svg
permalink: /2022/07/20/olap-query-profile/
comments: false
editorial_standard: expert-v1
---

OLAP 选型会上最没用的一张表，是把十几个引擎放在列上，把实时写入、向量化、物化视图、Join、扩缩容逐项打勾。功能都支持，不代表对同一份业务负载有相同代价。

我更关心现有查询到底长什么样：多少 SQL 只查近一天，多少会扫一年；过滤条件是否命中排序键；是高并发点查，还是低并发大聚合；Join 的小表到底多小；数据更新后允许几秒、几分钟还是第二天可见。没有这份查询画像，Benchmark 很容易变成谁更会调参数。

![OLAP 选型从真实负载到可复现 Benchmark](/images/articles/olap-query-profile.svg)

<!-- more -->

## 不要从引擎能力表开始

ClickHouse MergeTree 把数据写成按主键排序的 parts，后台合并同分区 parts，并用稀疏主键索引定位 granules。Apache Doris 把数据先按 Partition，再按 Hash bucket 分成 Tablets，并提供 Duplicate、Aggregate、Unique 等数据模型。两边都能执行过滤、聚合和 Join，但建表方式决定了某类查询要读多少数据、搬多少网络、做多少运行时合并。

如果只问“支不支持明细查询”，答案都是支持。真正的问题是：明细查询有没有稳定的等值键，键是否在 ORDER BY/prefix index 前缀，Doris bucket 是否能裁到少量 Tablets，ClickHouse sparse index 能否把范围缩到少量 granules。

同样，两个引擎都能做汇总。可如果报表总按固定维度聚合，Doris Aggregate model 或 Rollup 可以在存储层预聚合；ClickHouse 可以用 AggregatingMergeTree、Projection 或 Materialized View。选哪种不是看功能名称，而是看明细保留要求、聚合可结合性、写入时计算预算和查询维度变化频率。

所以第一阶段不安装集群。我会先从 SQL 网关、BI 查询日志和调度平台提取 2 到 4 周的真实 workload，按查询形状聚类，再找每类的代表 SQL。

## 查询画像至少要有六组数字

第一组是过滤形状。记录时间范围、等值/范围字段、是否总带租户、过滤选择率和最终返回行数。`WHERE tenant_id=? AND event_time BETWEEN ...` 与只按 `event_time` 扫描，对排序键的要求完全不同。

第二组是扫描规模。不能只存 SQL 文本，要从现有引擎拿 scanned rows/bytes、selected partitions/files 和结果行数。扫描十亿行返回一百行，与扫描一百万行返回八十万行，瓶颈不会一样。

第三组是计算形状：GROUP BY 基数、distinct 数量、窗口函数、排序与 TopN、Join 的 build/probe 大小、是否存在数据倾斜。尤其要保存 Join 后膨胀比例，很多“引擎慢”其实是上游模型把一对多关系重复展开。

第四组是并发。平均 QPS 没有意义，我会看峰值 1 分钟/5 分钟并发、查询到达突发、长短查询混跑比例，以及 p50/p95/p99。十条 30 秒查询同时到达，与每秒一百条 50 ms 点查，需要不同的资源隔离和数据分布。

第五组是数据变化：每秒/每批写入量、单次 batch 大小、可见性 SLA、update/delete 比例、迟到窗口与重复数据处理。追加日志与频繁按主键修正的订单宽表，对 MergeTree family 或 Doris data model 的选择完全不同。

第六组是生命周期与成本：保留天数、冷热比例、副本数、压缩率、后台 merge/compaction、备份恢复目标。查询延迟一样时，存储放大和后台 IO 可能差很多。

## 排序、分区与分桶要按 Query Family 验证

ClickHouse 22.6 的 MergeTree 文档明确区分 `PARTITION BY` 与 `ORDER BY`：分区主要管理数据并做粗粒度裁剪，查询性能更多依赖排序键和稀疏索引；文档甚至提醒不要用客户 ID 做过细分区，而应考虑把它放到 ORDER BY 前部。

这是查询画像能直接指导 DDL 的地方。如果 80% 查询都先按 `tenant_id` 等值过滤，再按时间取范围，那么 `(tenant_id, event_time)` 很可能比 `(event_time, tenant_id)` 更符合索引前缀。可若多数查询跨全部 tenant 看某天指标，顺序可能反过来。不能只按“时间列最常用”决定。

Doris 的两级组织是 Range/List Partition 加 Hash Bucket。1.1 文档把 bucket 列选择明确写成吞吐与并发的权衡：bucket 键较少时，带完整等值条件的点查可能只扫一个 bucket；键更多、分布更均匀，但不满足所有 bucket 等值条件的查询会扫描全部 buckets。

因此同一组数据至少要准备两到三种候选 DDL。Benchmark 不是只换引擎不换表，而是让每个引擎使用符合其机制、同时又可维护的建模方案。若给 ClickHouse 一个不匹配过滤前缀的 ORDER BY，再给 Doris 一个严重倾斜的 bucket key，结果没有比较价值。

## Benchmark 必须保留冷、热和混合负载

单条 SQL 连续跑十次，取最好成绩，是最容易制造漂亮数字的方法。生产用户不会等缓存预热好再发请求，也不会保证只有一种查询。

我会把测试分三类。冷读清理 page cache 或换未访问分区，测存储扫描与解压；热读重复同一查询，测缓存和执行效率；混合负载按真实到达率同时运行点查、大聚合、导出和写入，测排队、尾延迟和资源干扰。

每次结果至少记录：query ID、SQL hash、数据快照、DDL、并发、p50/p95/p99、scanned rows/bytes、returned rows、CPU time、peak memory、network bytes 和后台任务状态。只比较 wall time，无法解释一次波动来自查询计划、merge、compaction 还是其他租户。

正确性先于性能。对每条代表 SQL，我会选一个可信基准结果，比较 row count、分组 key、聚合值和 null/decimal/timezone 语义。引擎把查询在 200 ms 内算错，不是性能优势。

## Join 能力要落到数据摆放

“支持分布式 Join”也不够。维表是广播到每个节点，还是按 key 重分布？事实表与维表能否 colocate？维表更新多久可见？一个理论上 50 MB 的小表，展开字符串和 hash table 后实际占多少内存？

Doris 的 Partition/Tablet 分布与 Colocation/Bucket Shuffle 类策略，会影响 Join 是否需要双边 shuffle。ClickHouse 分布式表的 shard key 与本地排序决定数据在哪个节点，但业务 Join key 不一定与 shard key 相同。画像里要记录 Join key 组合与数据倾斜，Benchmark 则必须用生产接近的节点数，单机结果无法体现网络重分布。

我还会把可避免的 Join 单列出来。很多看板查询每次连接十张维表，只是因为数据仓库沿用规范化模型。面向固定分析场景构建适度宽表或字典，可能比争论哪种 Join 算法更有效。引擎选型不应成为掩盖模型问题的比赛。

## 结论应该按查询族给出

最终报告不写“A 引擎比 B 快 30%”。我会按查询族给出适用性：高并发租户点查、近七天多维聚合、跨年明细导出、实时更新后的查询、复杂 Join 和低频自由探索，各自列出延迟、吞吐、资源成本、DDL 约束与运维风险。

某个引擎可能在日志追加和范围聚合上明显占优，另一个在主键更新、标准 SQL 和多表分析上更容易平台化。企业数据平台完全可能保留两种服务层，而不是逼一个引擎承担所有负载。

查询画像还有一个长期价值：上线后可以用相同指标检查负载是否漂移。最初 90% 查近一天，半年后大量跨月查询出现，原先的排序、分区和资源隔离可能已经不适合。选型不是一次考试，画像应成为容量与模型治理的基线。

先把谁在什么时候、用什么条件、扫多少数据、需要多快写清楚，才能讨论引擎。否则功能表越详细，结论越像主观偏好。

## 对照源码与文档

- [ClickHouse 22.6 MergeTree：排序、稀疏索引与分区的职责](https://github.com/ClickHouse/ClickHouse/blob/d5566f2f2dd7e21ed1472d8b0f33c2266ae103f8/docs/en/engines/table-engines/mergetree-family/mergetree.md#L10-L20)
- [ClickHouse 22.6 MergeTree：PARTITION BY 不应代替 ORDER BY 做查询优化](https://github.com/ClickHouse/ClickHouse/blob/d5566f2f2dd7e21ed1472d8b0f33c2266ae103f8/docs/en/engines/table-engines/mergetree-family/mergetree.md#L63-L80)
- [ClickHouse 22.6 MergeTree：part、granule 与 sparse primary index](https://github.com/ClickHouse/ClickHouse/blob/d5566f2f2dd7e21ed1472d8b0f33c2266ae103f8/docs/en/engines/table-engines/mergetree-family/mergetree.md#L160-L199)
- [Apache Doris 1.1：Partition、Bucket 与 Tablet 的物理边界](https://github.com/apache/doris/blob/a6eb47ac0875ed51291ed7b1cd990d40f7d901de/docs/en/getting-started/data-partition.md#L39-L45)
- [Apache Doris 1.1：bucket key 在查询吞吐与点查并发之间的权衡](https://github.com/apache/doris/blob/a6eb47ac0875ed51291ed7b1cd990d40f7d901de/docs/en/getting-started/data-partition.md#L251-L268)
- [Apache Doris 1.1：Aggregate、Unique 与 Duplicate 数据模型](https://github.com/apache/doris/blob/a6eb47ac0875ed51291ed7b1cd990d40f7d901de/docs/en/getting-started/data-model-rollup.md#L39-L46)
