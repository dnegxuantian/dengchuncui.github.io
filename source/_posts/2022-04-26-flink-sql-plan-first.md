---
title: "Flink SQL 调优先读执行计划"
date: "2022-04-26 08:25:24"
updated: "2022-04-26 08:25:24"
categories:
- "实时计算"
tags:
- "Flink SQL"
- "执行计划"
- "性能"
description: "Flink SQL 变慢时直接加并行度，常常只是把数据倾斜和状态膨胀摊到更多 TaskManager 上。 执行计划决定数据如何移动和保存，不读计划就无法解释资源为什么被消耗。"
cover: /images/timeline/flink-sql-plan-first.svg
top_img: /images/timeline/flink-sql-plan-first.svg
permalink: /2022/04/26/flink-sql-plan-first/
comments: false
---

<!-- generated: timeline-backfill -->

Flink SQL 变慢时直接加并行度，常常只是把数据倾斜和状态膨胀摊到更多 TaskManager 上。

![Flink SQL 调优先读执行计划](/images/timeline/flink-sql-plan-first.svg)

## 架构判断

先从执行计划确认 Join 顺序、Exchange、Changelog 模式和状态算子，再定位指标。

## 留给运维的答案

- 维表 Join 要看缓存命中与外部查询延迟；流流 Join 则要明确状态保留时间。
- 调优前后固定输入回放，比较吞吐、延迟、状态大小与结果条数，避免只优化某个局部指标。

执行计划决定数据如何移动和保存，不读计划就无法解释资源为什么被消耗。

### 延伸资料

- [Apache Flink Documentation](https://flink.apache.org/what-is-flink/flink-architecture/)
