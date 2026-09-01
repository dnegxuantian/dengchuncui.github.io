---
title: "补数据要有独立的运行语义"
date: "2022-10-17 12:39:39"
updated: "2022-10-17 12:39:39"
categories:
- "数据平台"
tags:
- "补数据"
- "任务调度"
- "数据一致性"
description: "补数据不是把历史日期塞进普通调度参数。它会改变并发、依赖、资源和下游覆盖范围。 补数能力做得好不好，看的是能否暂停、续跑、对账和撤销，而不是能否一次提交很多日期。"
cover: /images/timeline/backfill-runtime-semantics.svg
top_img: /images/timeline/backfill-runtime-semantics.svg
permalink: /2022/10/17/backfill-runtime-semantics/
comments: false
---

<!-- generated: timeline-backfill -->

补数据不是把历史日期塞进普通调度参数。它会改变并发、依赖、资源和下游覆盖范围。

![补数据要有独立的运行语义](/images/timeline/backfill-runtime-semantics.svg)

## 架构判断

> 补数批次要有独立 ID，明确日期集合、代码版本和是否覆盖已有产出。

- 历史实例与日常实例分队列运行，避免大范围回刷挤掉当天主链路。
- 下游触发采用批次完成事件，而不是每个日期完成一次就重复触发。

## 留给运维的答案

补数能力做得好不好，看的是能否暂停、续跑、对账和撤销，而不是能否一次提交很多日期。

### 延伸资料

- [YARN CapacityScheduler](https://hadoop.apache.org/docs/current/hadoop-yarn/hadoop-yarn-site/CapacityScheduler.html)
