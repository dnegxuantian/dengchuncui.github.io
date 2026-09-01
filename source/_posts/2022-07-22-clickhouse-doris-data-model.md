---
title: "ClickHouse 与 Doris 的差别要落到数据模型"
date: "2022-07-22 15:50:49"
updated: "2022-07-22 15:50:49"
categories:
- "数据平台"
tags:
- "ClickHouse"
- "Apache Doris"
- "OLAP"
description: "ClickHouse 和 Doris 都能做分析查询，但数据模型、更新路径和运维方式不同，不能只用一组聚合 SQL 下结论。 引擎没有绝对胜负，关键是它的数据模型是否贴合你的写入语义。"
cover: /images/timeline/clickhouse-doris-data-model.svg
top_img: /images/timeline/clickhouse-doris-data-model.svg
permalink: /2022/07/22/clickhouse-doris-data-model/
comments: false
---

<!-- generated: timeline-backfill -->

ClickHouse 和 Doris 都能做分析查询，但数据模型、更新路径和运维方式不同，不能只用一组聚合 SQL 下结论。

![ClickHouse 与 Doris 的差别要落到数据模型](/images/timeline/clickhouse-doris-data-model.svg)

## 把问题拆开

ClickHouse 的 MergeTree 家族强调排序键与后台合并，建模时要接受数据最终合并的过程。

### 实施时

- Doris 的 Key 模型把聚合、唯一键和明细语义前置，适合把更新规则写进表设计。
- 比较时加入重复写、删除、扩容和节点故障，才能看到日常维护成本。

## 验收标准

引擎没有绝对胜负，关键是它的数据模型是否贴合你的写入语义。

### 延伸资料

- [ClickHouse Documentation](https://clickhouse.com/docs)
