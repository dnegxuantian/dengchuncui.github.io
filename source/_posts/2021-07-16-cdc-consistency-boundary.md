---
title: "CDC 链路最难的是一致性边界"
date: "2021-07-16 12:10:52"
updated: "2021-07-16 12:10:52"
categories:
- "实时计算"
tags:
- "CDC"
- "Flink"
- "数据一致性"
description: "把数据库变更接进 Kafka 并不难，真正麻烦的是全量切增量、DDL 变化和下游幂等如何落在同一条边界上。 CDC 的验收标准不是延迟低，而是重启、扩容和 DDL 变化后仍能解释每一条数据。"
cover: /images/timeline/cdc-consistency-boundary.svg
top_img: /images/timeline/cdc-consistency-boundary.svg
permalink: /2021/07/16/cdc-consistency-boundary/
comments: false
---

<!-- generated: timeline-backfill -->

把数据库变更接进 Kafka 并不难，真正麻烦的是全量切增量、DDL 变化和下游幂等如何落在同一条边界上。

![CDC 链路最难的是一致性边界](/images/timeline/cdc-consistency-boundary.svg)

## 别急着换组件

> 全量快照必须记录增量位点，切换时以位点而不是墙上时间判断是否衔接。

- 更新与删除需要稳定主键；没有主键的表只能接受追加语义或额外构造业务键。
- 下游写入失败后的重放要验证幂等，Exactly-once 标签不能替代端到端检查。

## 实施顺序

CDC 的验收标准不是延迟低，而是重启、扩容和 DDL 变化后仍能解释每一条数据。

### 延伸资料

- [Apache Flink Documentation](https://flink.apache.org/what-is-flink/flink-architecture/)
