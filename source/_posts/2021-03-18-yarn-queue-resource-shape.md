---
title: "YARN 队列排队要看资源形状"
date: "2021-03-18 12:02:48"
updated: "2021-03-18 12:02:48"
categories:
- "资源治理"
tags:
- "YARN"
- "队列"
- "资源调度"
description: "队列明明还有资源，任务却一直 Pending，常见原因不是总量不足，而是单个 Container 的资源形状无法被满足。 容量治理看的是可分配性，不只是集群总核数和总内存。"
cover: /images/timeline/yarn-queue-resource-shape.svg
top_img: /images/timeline/yarn-queue-resource-shape.svg
permalink: /2021/03/18/yarn-queue-resource-shape/
comments: false
---

<!-- generated: timeline-backfill -->

队列明明还有资源，任务却一直 Pending，常见原因不是总量不足，而是单个 Container 的资源形状无法被满足。

![YARN 队列排队要看资源形状](/images/timeline/yarn-queue-resource-shape.svg)

## 别急着换组件

> 同时检查队列剩余量、节点最大可用块和任务单 Container 申请值，三者不是一个指标。

- 大内存少核与小内存多核任务混跑时容易留下无法利用的碎片，需要按作业类型拆资源画像。
- 调度诊断必须保留申请时间、分配时间和节点选择结果，只有最终状态无法解释排队。

## 实施顺序

容量治理看的是可分配性，不只是集群总核数和总内存。

### 延伸资料

- [YARN CapacityScheduler](https://hadoop.apache.org/docs/current/hadoop-yarn/hadoop-yarn-site/CapacityScheduler.html)
