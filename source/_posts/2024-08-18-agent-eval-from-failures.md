---
title: "Agent 评测集要来自真实失败"
date: "2024-08-18 17:54:00"
updated: "2024-08-18 17:54:00"
categories:
- "AI Agent"
tags:
- "Agent 评测"
- "回归"
- "失败样本"
description: "只用人工编写的标准问题评测，覆盖不到生产里的省略表达、错误上下文和工具异常。 评测集不是展示模型聪明的考卷，而是系统曾经付过代价的故障清单。"
cover: /images/timeline/agent-eval-from-failures.svg
top_img: /images/timeline/agent-eval-from-failures.svg
permalink: /2024/08/18/agent-eval-from-failures/
comments: false
---

<!-- generated: timeline-backfill -->

只用人工编写的标准问题评测，覆盖不到生产里的省略表达、错误上下文和工具异常。

![Agent 评测集要来自真实失败](/images/timeline/agent-eval-from-failures.svg)

## 问题通常出在哪

从真实失败中脱敏提取任务，标注期望结果、允许路径和禁止动作。

分别评估最终答案、工具选择、参数和证据，不让一个总分掩盖关键失败。

## 判断是否有效

修复线上问题时必须把对应样本加入回归集，防止同类错误反复出现。

评测集不是展示模型聪明的考卷，而是系统曾经付过代价的故障清单。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
