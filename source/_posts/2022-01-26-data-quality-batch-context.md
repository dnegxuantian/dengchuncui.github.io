---
title: "数据质量规则要绑定业务批次"
date: "2022-01-26 19:29:48"
updated: "2022-01-26 19:29:48"
categories:
- "数据治理"
tags:
- "数据质量"
- "批次"
- "告警"
description: "一条空值率规则脱离业务批次就没有意义。春节、月末和日常批次的基线不同，固定阈值会制造噪声。 质量平台的目标不是规则数量，而是让异常在进入下游之前能被判断和处置。"
cover: /images/timeline/data-quality-batch-context.svg
top_img: /images/timeline/data-quality-batch-context.svg
permalink: /2022/01/26/data-quality-batch-context/
comments: false
---

<!-- generated: timeline-backfill -->

一条空值率规则脱离业务批次就没有意义。春节、月末和日常批次的基线不同，固定阈值会制造噪声。

![数据质量规则要绑定业务批次](/images/timeline/data-quality-batch-context.svg)

## 先看边界

1. 规则运行要携带业务日期、输入版本和上游完成状态，避免把上游未到齐误判成质量下降。
2. 绝对阈值负责硬约束，历史分位数负责发现漂移，两类规则不能互相替代。
3. 告警中直接给出异常样本和近七次对比，减少值班人员再次查询的时间。

## 落地时我会盯住什么

质量平台的目标不是规则数量，而是让异常在进入下游之前能被判断和处置。

### 延伸资料

- [Apache Hadoop Documentation](https://hadoop.apache.org/docs/stable/)
