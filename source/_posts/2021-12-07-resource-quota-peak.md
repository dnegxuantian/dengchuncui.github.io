---
title: "资源配额应该约束峰值而不是平均值"
date: "2021-12-07 10:17:07"
updated: "2021-12-07 10:17:07"
categories:
- "资源治理"
tags:
- "资源配额"
- "容量规划"
- "调度"
description: "按月平均 CPU 利用率分配资源，会掩盖数据平台真正的冲突：大量任务集中在相同业务时点启动。 资源治理不是把集群切成固定小块，而是把峰值冲突变成可解释的优先级。"
cover: /images/timeline/resource-quota-peak.svg
top_img: /images/timeline/resource-quota-peak.svg
permalink: /2021/12/07/resource-quota-peak/
comments: false
---

<!-- generated: timeline-backfill -->

按月平均 CPU 利用率分配资源，会掩盖数据平台真正的冲突：大量任务集中在相同业务时点启动。

![资源配额应该约束峰值而不是平均值](/images/timeline/resource-quota-peak.svg)

## 我会先看三组证据

- 容量画像至少按 15 分钟观察并发、申请量和实际使用量，平均值只适合财务汇总。
- 核心链路要保留独立保底资源，临时补数和探索任务只能使用可抢占份额。
- 配额调整应关联 SLA 和历史排队证据，不能靠谁先报资源谁拿得多。

## 取舍

资源治理不是把集群切成固定小块，而是把峰值冲突变成可解释的优先级。

### 延伸资料

- [YARN CapacityScheduler](https://hadoop.apache.org/docs/current/hadoop-yarn/hadoop-yarn-site/CapacityScheduler.html)
