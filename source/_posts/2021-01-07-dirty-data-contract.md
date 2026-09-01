---
title: "脏数据阈值应该写进同步任务契约"
date: "2021-01-07 11:02:01"
updated: "2021-01-07 11:02:01"
categories:
- "数据集成"
tags:
- "脏数据"
- "DataX"
- "数据质量"
description: "脏数据不是“打印日志后继续跑”这么简单。容忍多少、落到哪里、谁来处理，都应在任务发布前确定。 可接受的坏数据必须被明确描述；没有边界的容错，本质上是静默丢数。"
cover: /images/timeline/dirty-data-contract.svg
top_img: /images/timeline/dirty-data-contract.svg
permalink: /2021/01/07/dirty-data-contract/
comments: false
---

<!-- generated: timeline-backfill -->

脏数据不是“打印日志后继续跑”这么简单。容忍多少、落到哪里、谁来处理，都应在任务发布前确定。

![脏数据阈值应该写进同步任务契约](/images/timeline/dirty-data-contract.svg)

## 架构判断

> 按条数设置阈值会忽略数据规模，按比例设置阈值又会纵容大表；生产任务通常需要两者同时约束。

- 原始记录、异常字段、转换规则和批次号要一起进入隔离区，只有错误文本很难复现。
- 达到阈值后是失败还是告警，要由下游消费语义决定，不能让同步工具替业务做决定。

## 留给运维的答案

可接受的坏数据必须被明确描述；没有边界的容错，本质上是静默丢数。

### 延伸资料

- [Alibaba DataX](https://github.com/alibaba/DataX)
