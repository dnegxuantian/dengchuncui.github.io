---
title: "LLM 应用可观测性要串起一次完整运行"
date: "2024-01-04 11:05:43"
updated: "2024-01-04 11:05:43"
categories:
- "模型工程"
tags:
- "LLM 可观测性"
- "Trace"
- "工具调用"
description: "只统计 Token 和响应时间，看不到一次回答经历了几轮检索、调用了什么工具、在哪一步偏离。 Agent 可观测性的基本单位是一次运行轨迹，而不是某个模型接口。"
cover: /images/timeline/llm-run-observability.svg
top_img: /images/timeline/llm-run-observability.svg
permalink: /2024/01/04/llm-run-observability/
comments: false
---

<!-- generated: timeline-backfill -->

只统计 Token 和响应时间，看不到一次回答经历了几轮检索、调用了什么工具、在哪一步偏离。

![LLM 应用可观测性要串起一次完整运行](/images/timeline/llm-run-observability.svg)

## 别急着换组件

一次用户请求生成稳定 Run ID，关联模型调用、检索、工具、重试和最终输出。

### 实施时

- Span 中保存版本、耗时、状态和证据引用，正文是否记录由数据分级策略决定。
- 错误率按阶段拆分，模型超时与工具参数错误不能混成一个失败指标。

## 实施顺序

Agent 可观测性的基本单位是一次运行轨迹，而不是某个模型接口。

### 延伸资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
