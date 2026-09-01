---
title: "Agent Memory 要分事实、偏好与运行状态"
date: "2025-06-21 13:58:38"
updated: "2025-06-21 13:58:38"
categories:
- "AI Agent"
tags:
- "Agent Memory"
- "上下文"
- "状态"
description: "把所有历史对话塞进一个向量库，会混淆用户事实、表达偏好和某次任务的临时状态。 Memory 不是更长的聊天记录，而是一套有类型、有生命周期的数据模型。"
cover: /images/timeline/agent-memory-three-layers.svg
top_img: /images/timeline/agent-memory-three-layers.svg
permalink: /2025/06/21/agent-memory-three-layers/
comments: false
---

<!-- generated: timeline-backfill -->

把所有历史对话塞进一个向量库，会混淆用户事实、表达偏好和某次任务的临时状态。

![Agent Memory 要分事实、偏好与运行状态](/images/timeline/agent-memory-three-layers.svg)

## 别急着换组件

> 事实记忆要求来源与有效期，偏好记忆允许用户查看和修改。

- 运行状态属于具体任务，完成后归档，不应长期影响无关会话。
- 写入记忆前做价值判断与敏感信息过滤，读取时按任务和权限筛选。

## 实施顺序

Memory 不是更长的聊天记录，而是一套有类型、有生命周期的数据模型。

### 延伸资料

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18)
