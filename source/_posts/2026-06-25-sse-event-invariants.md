---
title: "SSE 完整性要用事件不变量验证"
date: "2026-06-25 21:38:55"
updated: "2026-06-25 21:38:55"
categories:
- "模型工程"
tags:
- "SSE"
- "流式协议"
- "完整性"
description: "流式调用返回 200 仍可能缺少文本、工具结果或结束事件。验收需要定义一组事件不变量。 连接正常不是流式成功；只有事件序列满足契约，最终消息才可信。"
cover: /images/timeline/sse-event-invariants.svg
top_img: /images/timeline/sse-event-invariants.svg
permalink: /2026/06/25/sse-event-invariants/
comments: false
---

<!-- generated: timeline-backfill -->

流式调用返回 200 仍可能缺少文本、工具结果或结束事件。验收需要定义一组事件不变量。

![SSE 完整性要用事件不变量验证](/images/timeline/sse-event-invariants.svg)

## 我会先看三组证据

> 每次响应有唯一 ID，增量事件序号单调，结束事件只能出现一次。

- 工具调用的参数开始、增量、完成与结果必须成对，缺一段就标记协议失败。
- 聚合后的消息长度、结束原因和原始事件摘要一起落库，用于链路对账。

## 取舍

连接正常不是流式成功；只有事件序列满足契约，最终消息才可信。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
