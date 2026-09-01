---
title: "Checkpoint 变慢先看反压传播"
date: "2021-06-12 08:29:42"
updated: "2021-06-12 08:29:42"
categories:
- "实时计算"
tags:
- "Flink"
- "Checkpoint"
- "反压"
description: "Checkpoint 超时经常被误判成存储慢。数据通道已经反压时，Barrier 到不齐才是更常见的原因。 Checkpoint 是整条流作业健康度的投影，不是一个孤立的存储指标。"
cover: /images/timeline/flink-checkpoint-backpressure.svg
top_img: /images/timeline/flink-checkpoint-backpressure.svg
permalink: /2021/06/12/flink-checkpoint-backpressure/
comments: false
---

<!-- generated: timeline-backfill -->

Checkpoint 超时经常被误判成存储慢。数据通道已经反压时，Barrier 到不齐才是更常见的原因。

![Checkpoint 变慢先看反压传播](/images/timeline/flink-checkpoint-backpressure.svg)

## 别急着换组件

把端到端时长拆成 Barrier 对齐、状态持久化和确认三个阶段，先找最长的一段。

## 实施顺序

- 对齐时间持续升高时应沿算子链反向查吞吐，不能只调大超时掩盖下游处理不足。
- 无对齐 Checkpoint 能缓解高反压场景，但会增加在途数据快照，恢复成本也要一起评估。

Checkpoint 是整条流作业健康度的投影，不是一个孤立的存储指标。

### 延伸资料

- [Apache Flink 1.11 Release](https://flink.apache.org/2020/07/06/apache-flink-1.11.0-release-announcement/)
