---
title: "Iceberg 1.0 之后更该关注运维闭环"
date: "2022-09-15 11:36:50"
updated: "2022-09-15 11:36:50"
categories:
- "湖仓架构"
tags:
- "Iceberg"
- "快照管理"
- "湖仓运维"
description: "API 进入稳定阶段不代表表会自动健康。快照、Manifest、小文件和孤儿文件仍需要持续维护。 表格式稳定以后，平台竞争力反而更取决于谁能把日常运维做成闭环。"
cover: /images/timeline/iceberg-operations-loop.svg
top_img: /images/timeline/iceberg-operations-loop.svg
permalink: /2022/09/15/iceberg-operations-loop/
comments: false
---

<!-- generated: timeline-backfill -->

API 进入稳定阶段不代表表会自动健康。快照、Manifest、小文件和孤儿文件仍需要持续维护。

![Iceberg 1.0 之后更该关注运维闭环](/images/timeline/iceberg-operations-loop.svg)

## 把问题拆开

1. 每张表要有快照保留、旧文件清理和合并策略，并区分热表与归档表。
2. 维护动作必须记录基准快照、影响文件和执行结果，失败后才能判断是否可重试。
3. 查询延迟、规划耗时和元数据数量一起监控，比只盯数据容量更早发现退化。

## 验收标准

表格式稳定以后，平台竞争力反而更取决于谁能把日常运维做成闭环。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
