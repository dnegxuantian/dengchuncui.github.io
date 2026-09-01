---
title: "模型网关路由要看任务成功成本"
date: "2025-09-22 13:40:29"
updated: "2025-09-22 13:40:29"
categories:
- "模型工程"
tags:
- "模型网关"
- "路由"
- "成本治理"
description: "便宜模型如果多次重试或经常调用错误工具，最终成本可能比一次使用强模型更高。 网关优化的目标是稳定完成任务的总成本，不是把每个请求送到最低报价。"
cover: /images/timeline/model-routing-success-cost.svg
top_img: /images/timeline/model-routing-success-cost.svg
permalink: /2025/09/22/model-routing-success-cost/
comments: false
---

<!-- generated: timeline-backfill -->

便宜模型如果多次重试或经常调用错误工具，最终成本可能比一次使用强模型更高。

![模型网关路由要看任务成功成本](/images/timeline/model-routing-success-cost.svg)

## 我会先看三组证据

按任务类型统计一次成功所需 Token、重试次数、延迟和人工接管率。

## 取舍

- 简单分类和抽取走轻模型，复杂规划按置信度升级，但升级路径必须有上限。
- 路由实验使用同一评测集，比较任务成功成本而不是单价。

网关优化的目标是稳定完成任务的总成本，不是把每个请求送到最低报价。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
