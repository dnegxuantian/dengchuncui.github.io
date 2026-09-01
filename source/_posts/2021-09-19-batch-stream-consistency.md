---
title: "批流一致不是把两套 SQL 写成一样"
date: "2021-09-19 13:34:20"
updated: "2021-09-19 13:34:20"
categories:
- "数据平台"
tags:
- "批流一体"
- "口径"
- "数据验证"
description: "同一段 SQL 分别跑在离线和实时引擎上，也可能得到不同结果：时间语义、乱序和更新模型都会改变口径。 批流统一首先是语义统一，执行引擎共用只是后面的实现选择。"
cover: /images/timeline/batch-stream-consistency.svg
top_img: /images/timeline/batch-stream-consistency.svg
permalink: /2021/09/19/batch-stream-consistency/
comments: false
---

<!-- generated: timeline-backfill -->

同一段 SQL 分别跑在离线和实时引擎上，也可能得到不同结果：时间语义、乱序和更新模型都会改变口径。

![批流一致不是把两套 SQL 写成一样](/images/timeline/batch-stream-consistency.svg)

## 先看边界

- 先明确事件时间、处理时间与业务日期的优先级，窗口边界必须能用样本数据复算。
- 维表更新在批处理中是某个切片，在流处理中却可能是持续变化的状态，需要定义生效时点。
- 用固定输入同时回放批任务和流任务，对比主键集合与聚合值，比代码 diff 更可信。

## 落地时我会盯住什么

批流统一首先是语义统一，执行引擎共用只是后面的实现选择。

### 延伸资料

- [Apache Flink Documentation](https://flink.apache.org/what-is-flink/flink-architecture/)
