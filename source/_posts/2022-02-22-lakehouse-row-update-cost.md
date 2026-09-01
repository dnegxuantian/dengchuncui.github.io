---
title: "行级更新落到湖仓要算写放大"
date: "2022-02-22 09:42:38"
updated: "2022-02-22 09:42:38"
categories:
- "湖仓架构"
tags:
- "Iceberg"
- "行级更新"
- "写放大"
description: "湖仓支持 UPDATE、DELETE 以后，最容易被忽略的是写放大：改一行可能触发文件重写或额外删除文件。 行级能力不是免费 OLTP；湖仓仍然需要按文件和快照的成本模型做设计。"
cover: /images/timeline/lakehouse-row-update-cost.svg
top_img: /images/timeline/lakehouse-row-update-cost.svg
permalink: /2022/02/22/lakehouse-row-update-cost/
comments: false
---

<!-- generated: timeline-backfill -->

湖仓支持 UPDATE、DELETE 以后，最容易被忽略的是写放大：改一行可能触发文件重写或额外删除文件。

![行级更新落到湖仓要算写放大](/images/timeline/lakehouse-row-update-cost.svg)

## 架构判断

先区分 Copy-on-Write 与 Merge-on-Read 的读写代价，再按查询新鲜度选择。

## 留给运维的答案

- 高频小批更新会快速增加删除文件和 Manifest 数量，必须配套合并与过期策略。
- 评估时同时记录写入字节、读取放大和维护任务耗时，只看 SQL 延迟会低估成本。

行级能力不是免费 OLTP；湖仓仍然需要按文件和快照的成本模型做设计。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
