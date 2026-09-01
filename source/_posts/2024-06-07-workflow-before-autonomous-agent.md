---
title: "先做确定性 Workflow，再谈自主 Agent"
date: "2024-06-07 17:25:06"
updated: "2024-06-07 17:25:06"
categories:
- "AI Agent"
tags:
- "Workflow"
- "Agent"
- "工程化"
description: "很多业务流程步骤明确，却被包装成自由规划 Agent，结果是成本更高、错误更难复现。 自主程度不是卖点；用最少的不确定性完成任务，才是生产系统的目标。"
cover: /images/timeline/workflow-before-autonomous-agent.svg
top_img: /images/timeline/workflow-before-autonomous-agent.svg
permalink: /2024/06/07/workflow-before-autonomous-agent/
comments: false
---

<!-- generated: timeline-backfill -->

很多业务流程步骤明确，却被包装成自由规划 Agent，结果是成本更高、错误更难复现。

![先做确定性 Workflow，再谈自主 Agent](/images/timeline/workflow-before-autonomous-agent.svg)

## 先看边界

> 固定审批、查询、校验顺序的场景用 Workflow，模型只处理分类和非结构化理解。

- 只有路径确实依赖中间结果、工具选择无法预先枚举时，才开放有限自主规划。
- 每一步定义输入、输出和失败分支，保证模型替换后流程仍能回归。

## 落地时我会盯住什么

自主程度不是卖点；用最少的不确定性完成任务，才是生产系统的目标。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
