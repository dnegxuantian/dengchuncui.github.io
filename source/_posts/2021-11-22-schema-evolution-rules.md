---
title: "Schema Evolution 不是随便加字段"
date: "2021-11-22 12:32:02"
updated: "2021-11-22 12:32:02"
categories:
- "数据治理"
tags:
- "Schema Evolution"
- "Iceberg"
- "兼容性"
description: "表格式支持 Schema Evolution，不代表上游可以无通知地改字段。技术兼容与业务兼容是两回事。 Schema Evolution 的目标是让变化可控地发生，不是让任何变化都悄悄通过。"
cover: /images/timeline/schema-evolution-rules.svg
top_img: /images/timeline/schema-evolution-rules.svg
permalink: /2021/11/22/schema-evolution-rules/
comments: false
---

<!-- generated: timeline-backfill -->

表格式支持 Schema Evolution，不代表上游可以无通知地改字段。技术兼容与业务兼容是两回事。

![Schema Evolution 不是随便加字段](/images/timeline/schema-evolution-rules.svg)

## 问题通常出在哪

新增可空字段通常安全，修改类型、复用字段名和改变主键语义必须进入变更评审。

### 实施时

- 字段要依赖稳定 ID 而不是位置匹配，否则重排列也可能被解释成数据变化。
- 下游消费清单与兼容矩阵要跟着表版本保存，不能只记录最新结构。

## 判断是否有效

Schema Evolution 的目标是让变化可控地发生，不是让任何变化都悄悄通过。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
