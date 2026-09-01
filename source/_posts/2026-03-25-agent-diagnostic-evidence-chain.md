---
title: "Agent 诊断要建立证据链"
date: "2026-03-25 12:34:24"
updated: "2026-03-25 12:34:24"
categories:
- "AI Agent"
tags:
- "证据链"
- "故障诊断"
- "Agent"
description: "最终回答错误，不代表一定是模型问题。错误可能从检索、协议转换、工具结果或消息聚合任何一层进入。 诊断结论应指向第一个证据发生变化的位置，而不是最后一个暴露错误的页面。"
cover: /images/timeline/agent-diagnostic-evidence-chain.svg
top_img: /images/timeline/agent-diagnostic-evidence-chain.svg
permalink: /2026/03/25/agent-diagnostic-evidence-chain/
comments: false
---

<!-- generated: timeline-backfill -->

最终回答错误，不代表一定是模型问题。错误可能从检索、协议转换、工具结果或消息聚合任何一层进入。

![Agent 诊断要建立证据链](/images/timeline/agent-diagnostic-evidence-chain.svg)

## 问题通常出在哪

> 按时间串联原始输入、上下文构建、模型事件、工具调用和持久化结果。

- 每层保留未经二次加工的原始证据，同时记录转换后的结构。
- 通过控制变量重放逐层替换输入，确认哪一层开始出现偏差。

## 判断是否有效

诊断结论应指向第一个证据发生变化的位置，而不是最后一个暴露错误的页面。

### 延伸资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
