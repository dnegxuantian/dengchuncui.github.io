---
title: "选 OLAP 引擎先写查询画像"
date: "2022-07-20 22:09:48"
updated: "2022-07-20 22:09:48"
categories:
- "数据平台"
tags:
- "OLAP"
- "查询画像"
- "架构选型"
description: "OLAP 选型容易陷入跑分。企业数据场景更需要先写清楚查询画像：明细还是聚合、并发多少、数据如何更新。 选型报告如果没有真实查询和数据分布，结论通常只是在比较产品宣传页。"
cover: /images/timeline/olap-query-profile.svg
top_img: /images/timeline/olap-query-profile.svg
permalink: /2022/07/20/olap-query-profile/
comments: false
---

<!-- generated: timeline-backfill -->

OLAP 选型容易陷入跑分。企业数据场景更需要先写清楚查询画像：明细还是聚合、并发多少、数据如何更新。

![选 OLAP 引擎先写查询画像](/images/timeline/olap-query-profile.svg)

## 架构判断

分别记录扫描范围、过滤选择性、聚合维度和返回行数，平均响应时间解释不了负载。

### 实施时

- 导入吞吐要与更新模型一起评估，能快速写入不等于能低成本处理频繁变更。
- 把最差的三类真实 SQL 放进长时间混合压测，短查询 benchmark 很难暴露后台合并影响。

## 留给运维的答案

选型报告如果没有真实查询和数据分布，结论通常只是在比较产品宣传页。

### 延伸资料

- [Apache Doris Documentation](https://doris.apache.org/docs/)
