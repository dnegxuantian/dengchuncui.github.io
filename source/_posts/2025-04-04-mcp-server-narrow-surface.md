---
title: "MCP Server 设计先收窄能力面"
date: "2025-04-04 18:30:03"
updated: "2025-04-04 18:30:03"
categories:
- "AI Agent"
tags:
- "MCP Server"
- "工具设计"
- "企业集成"
description: "把现有 REST API 原样批量转换成 MCP Tools，会给模型一个庞大且含义重叠的能力面。 MCP Server 的质量取决于能力建模，不取决于暴露了多少接口。"
cover: /images/timeline/mcp-server-narrow-surface.svg
top_img: /images/timeline/mcp-server-narrow-surface.svg
permalink: /2025/04/04/mcp-server-narrow-surface/
comments: false
---

<!-- generated: timeline-backfill -->

把现有 REST API 原样批量转换成 MCP Tools，会给模型一个庞大且含义重叠的能力面。

![MCP Server 设计先收窄能力面](/images/timeline/mcp-server-narrow-surface.svg)

## 先看边界

按用户任务封装工具，而不是按后台 Controller 数量暴露。

### 实施时

- 输入 Schema 使用业务名称和约束，内部 ID 查询由服务端完成，减少模型拼参数。
- 工具结果返回结构化状态、可读摘要和错误分类，避免模型解析任意日志文本。

## 落地时我会盯住什么

MCP Server 的质量取决于能力建模，不取决于暴露了多少接口。

### 延伸资料

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18)
