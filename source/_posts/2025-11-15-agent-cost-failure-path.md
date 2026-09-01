---
title: "Agent 成本要算上失败路径"
date: "2025-11-15 22:49:43"
updated: "2025-11-15 22:49:43"
categories:
- "模型工程"
tags:
- "Agent 成本"
- "Token"
- "失败恢复"
description: "只按成功请求平均 Token 估算成本，会漏掉循环、工具超时和人工接管这些最贵的路径。 生产 Agent 的成本模型必须包含它如何失败，否则预算一定偏乐观。"
cover: /images/timeline/agent-cost-failure-path.svg
top_img: /images/timeline/agent-cost-failure-path.svg
permalink: /2025/11/15/agent-cost-failure-path/
comments: false
---

<!-- generated: timeline-backfill -->

只按成功请求平均 Token 估算成本，会漏掉循环、工具超时和人工接管这些最贵的路径。

![Agent 成本要算上失败路径](/images/timeline/agent-cost-failure-path.svg)

## 把问题拆开

1. 按运行状态统计模型、检索、工具和基础设施成本，失败运行单独分组。
2. 重复工具调用和无效上下文增长设置预算告警，超过阈值提前终止。
3. 优化时同时看成功率与 P95 成本，平均值会掩盖少量失控任务。

## 验收标准

生产 Agent 的成本模型必须包含它如何失败，否则预算一定偏乐观。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
