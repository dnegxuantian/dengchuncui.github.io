---
title: "元数据先服务运维，再谈数据资产"
date: "2020-12-24 11:04:50"
updated: "2020-12-24 11:04:50"
categories:
- "数据治理"
tags:
- "元数据"
- "数据资产"
- "运维"
description: "元数据平台最早能产生价值的地方，不是漂亮的资产目录，而是回答任务用了什么表、谁改过、失败影响谁。 资产化是结果，能在故障现场被查询和关联，才说明元数据真正进入了平台。"
cover: /images/timeline/metadata-for-operations-first.svg
top_img: /images/timeline/metadata-for-operations-first.svg
permalink: /2020/12/24/metadata-for-operations-first/
comments: false
---

<!-- generated: timeline-backfill -->

元数据平台最早能产生价值的地方，不是漂亮的资产目录，而是回答任务用了什么表、谁改过、失败影响谁。

![元数据先服务运维，再谈数据资产](/images/timeline/metadata-for-operations-first.svg)

## 把问题拆开

技术元数据要先覆盖数据源、表、字段、任务、实例五类对象，并给每个对象稳定标识。

## 验收标准

- 采集时间和来源必须入库，否则同一个字段的两份定义无法判断哪份可信。
- 血缘先做到任务级和表级可用，再补字段级；一开始追求全量字段血缘，维护成本通常高于收益。

资产化是结果，能在故障现场被查询和关联，才说明元数据真正进入了平台。

### 延伸资料

- [Apache Hadoop Documentation](https://hadoop.apache.org/docs/stable/)
