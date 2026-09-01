---
title: "数据平台成本要按任务归因"
date: "2022-10-07 17:23:28"
updated: "2022-10-07 17:23:28"
categories:
- "资源治理"
tags:
- "成本治理"
- "任务"
- "资源归因"
description: "集群总账只能说明花了多少钱，不能告诉你哪条链路值得优化。成本必须能落到任务、表和业务批次。 成本治理不是月底做报表，而是让架构选择能看到价格标签。"
cover: /images/timeline/data-platform-cost-attribution.svg
top_img: /images/timeline/data-platform-cost-attribution.svg
permalink: /2022/10/07/data-platform-cost-attribution/
comments: false
---

<!-- generated: timeline-backfill -->

集群总账只能说明花了多少钱，不能告诉你哪条链路值得优化。成本必须能落到任务、表和业务批次。

![数据平台成本要按任务归因](/images/timeline/data-platform-cost-attribution.svg)

## 问题通常出在哪

计算侧记录实际核时、内存时和等待时长，存储侧记录容量、文件数与访问热度。

## 判断是否有效

- 共享服务成本按可解释规则分摊，避免把元数据、调度器全部算到某个大任务头上。
- 优化前后同时比较 SLA 和单位数据成本，单纯压低资源可能只是把任务推迟。

成本治理不是月底做报表，而是让架构选择能看到价格标签。

### 延伸资料

- [Kubernetes Scheduling](https://kubernetes.io/docs/concepts/scheduling-eviction/)
