---
title: "Agent Trace 要能回答谁做了决定"
date: "2025-03-20 13:14:52"
updated: "2025-03-20 13:14:52"
categories:
- "AI Agent"
tags:
- "Tracing"
- "决策"
- "可观测性"
description: "一条轨迹里既有模型选择，也有代码规则和人工确认。出错后必须分清究竟是谁决定了下一步。 能定位决策主体，才谈得上责任边界、错误归因和针对性评测。"
cover: /images/timeline/agent-trace-decision-owner.svg
top_img: /images/timeline/agent-trace-decision-owner.svg
permalink: /2025/03/20/agent-trace-decision-owner/
comments: false
---

<!-- generated: timeline-backfill -->

一条轨迹里既有模型选择，也有代码规则和人工确认。出错后必须分清究竟是谁决定了下一步。

![Agent Trace 要能回答谁做了决定](/images/timeline/agent-trace-decision-owner.svg)

## 问题通常出在哪

事件标注决策主体：模型、策略引擎、工具服务或用户。

## 判断是否有效

- 模型决策保存候选动作和最终选择，代码决策保存命中的规则版本。
- 人工确认记录展示内容与确认结果，不能只留一个布尔值。

能定位决策主体，才谈得上责任边界、错误归因和针对性评测。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
