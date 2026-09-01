---
title: "有效 Agent 往往从简单组合开始"
date: "2024-12-23 22:25:46"
updated: "2024-12-23 22:25:46"
categories:
- "AI Agent"
tags:
- "Agent 架构"
- "Workflow"
- "可组合"
description: "复杂框架容易让团队先讨论角色数量和协作方式，却没有把单个任务的输入输出定义清楚。 Agent 架构的成熟度体现在可预测和可验证，不体现在有多少个角色名称。"
cover: /images/timeline/effective-agent-composable-patterns.svg
top_img: /images/timeline/effective-agent-composable-patterns.svg
permalink: /2024/12/23/effective-agent-composable-patterns/
comments: false
---

<!-- generated: timeline-backfill -->

复杂框架容易让团队先讨论角色数量和协作方式，却没有把单个任务的输入输出定义清楚。

![有效 Agent 往往从简单组合开始](/images/timeline/effective-agent-composable-patterns.svg)

## 先看边界

1. 能用提示链、路由、并行和评估器完成的任务，先采用这些可组合模式。
2. 只有步骤无法预先确定时才引入自主循环，并给工具和预算设置明确边界。
3. 架构评审以成功轨迹和失败轨迹为依据，不以流程图节点多少判断先进程度。

## 落地时我会盯住什么

Agent 架构的成熟度体现在可预测和可验证，不体现在有多少个角色名称。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
