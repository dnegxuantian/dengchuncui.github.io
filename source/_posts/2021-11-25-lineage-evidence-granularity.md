---
title: "血缘图好不好用取决于证据粒度"
date: "2021-11-25 15:31:29"
updated: "2021-11-25 15:31:29"
categories:
- "数据治理"
tags:
- "数据血缘"
- "元数据"
- "影响分析"
description: "一张连线很多的血缘图不一定能做影响分析。缺少版本、字段映射和运行实例，线条只是静态展示。 血缘的价值不在图有多大，而在每条边能否回答它从哪里来、在何时成立。"
cover: /images/timeline/lineage-evidence-granularity.svg
top_img: /images/timeline/lineage-evidence-granularity.svg
permalink: /2021/11/25/lineage-evidence-granularity/
comments: false
---

<!-- generated: timeline-backfill -->

一张连线很多的血缘图不一定能做影响分析。缺少版本、字段映射和运行实例，线条只是静态展示。

![血缘图好不好用取决于证据粒度](/images/timeline/lineage-evidence-granularity.svg)

## 先看边界

设计态血缘说明代码可能访问什么，运行态血缘说明本次实例实际读写了什么，两者要分开。

### 实施时

- SQL 解析得到的字段映射需要标注解析器版本和置信度，动态 SQL 不应伪装成确定关系。
- 影响分析要能落到任务负责人、调度周期和最近成功实例，才便于安排变更窗口。

## 落地时我会盯住什么

血缘的价值不在图有多大，而在每条边能否回答它从哪里来、在何时成立。

### 延伸资料

- [Apache Hadoop Documentation](https://hadoop.apache.org/docs/stable/)
