---
title: "表维护任务也要进入 SLA"
date: "2026-05-18 13:21:40"
updated: "2026-05-18 13:21:40"
categories:
- "湖仓架构"
tags:
- "Iceberg"
- "表维护"
- "SLA"
description: "查询 SLA 只约束前台引擎，却不约束快照过期、Manifest 重写和小文件合并，性能退化迟早会回到查询侧。 表维护是湖仓的后台控制面，应像业务任务一样被调度、观测和承诺。"
cover: /images/timeline/table-maintenance-sla.svg
top_img: /images/timeline/table-maintenance-sla.svg
permalink: /2026/05/18/table-maintenance-sla/
comments: false
---

<!-- generated: timeline-backfill -->

查询 SLA 只约束前台引擎，却不约束快照过期、Manifest 重写和小文件合并，性能退化迟早会回到查询侧。

![表维护任务也要进入 SLA](/images/timeline/table-maintenance-sla.svg)

## 先看边界

为维护任务定义积压量、最迟完成时间和资源上限。

### 实施时

- 失败后按表和分区保留计划，恢复时续做未完成部分而不是全量重扫。
- 维护效果用规划耗时、文件数量和扫描放大验证，任务成功状态不够。

## 落地时我会盯住什么

表维护是湖仓的后台控制面，应像业务任务一样被调度、观测和承诺。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
