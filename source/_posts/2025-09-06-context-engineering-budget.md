---
title: "Context Engineering 是信息预算"
date: "2025-09-06 18:39:33"
updated: "2025-09-06 18:39:33"
categories:
- "AI Agent"
tags:
- "Context Engineering"
- "上下文"
- "Token"
description: "上下文工程不是把更多资料塞给模型，而是在有限窗口里安排指令、事实、历史和工具反馈的优先级。 上下文是一种运行时资源，需要像内存一样分配、回收和观测。"
cover: /images/timeline/context-engineering-budget.svg
top_img: /images/timeline/context-engineering-budget.svg
permalink: /2025/09/06/context-engineering-budget/
comments: false
---

<!-- generated: timeline-backfill -->

上下文工程不是把更多资料塞给模型，而是在有限窗口里安排指令、事实、历史和工具反馈的优先级。

![Context Engineering 是信息预算](/images/timeline/context-engineering-budget.svg)

## 别急着换组件

- 系统规则和当前任务保持稳定区，检索证据按相关性与新鲜度动态进入。
- 长工具结果先结构化提取，原文通过引用按需读取，不重复占满上下文。
- 压缩前保留未完成目标、关键约束和证据指针，不能只做语言摘要。

## 实施顺序

上下文是一种运行时资源，需要像内存一样分配、回收和观测。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
