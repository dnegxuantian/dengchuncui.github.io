---
title: "知识新鲜度要有可计算的 SLA"
date: "2024-03-05 19:46:21"
updated: "2024-03-05 19:46:21"
categories:
- "AI 工程"
tags:
- "知识库"
- "新鲜度"
- "SLA"
description: "“知识库每天更新”太模糊。企业问答需要知道源内容变更后，多久不再引用旧版本。 新鲜度是端到端指标，只有把源、管道、索引和查询串起来才可承诺。"
cover: /images/timeline/knowledge-freshness-sla.svg
top_img: /images/timeline/knowledge-freshness-sla.svg
permalink: /2024/03/05/knowledge-freshness-sla/
comments: false
---

<!-- generated: timeline-backfill -->

“知识库每天更新”太模糊。企业问答需要知道源内容变更后，多久不再引用旧版本。

![知识新鲜度要有可计算的 SLA](/images/timeline/knowledge-freshness-sla.svg)

## 别急着换组件

新鲜度从源系统变更时间算到新索引可查询时间，不能从定时任务启动时间算。

### 实施时

- 不同内容分级：运行状态按分钟，产品文档按小时，历史制度按天。
- 抽样查询旧版本标识，验证撤回是否真正生效，队列无积压不代表线上已更新。

## 实施顺序

新鲜度是端到端指标，只有把源、管道、索引和查询串起来才可承诺。

### 延伸资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
