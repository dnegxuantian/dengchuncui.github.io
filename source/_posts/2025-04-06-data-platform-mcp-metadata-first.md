---
title: "数据平台的 MCP 应从元数据查询开始"
date: "2025-04-06 19:40:45"
updated: "2025-04-06 19:40:45"
categories:
- "AI Agent"
tags:
- "MCP"
- "数据平台"
- "元数据"
description: "数据平台接入 MCP，最稳的起点是表结构、任务状态和日志检索，而不是直接重跑或修改生产任务。 先让 Agent 看懂平台，再允许它改变平台，工程风险会低很多。"
cover: /images/timeline/data-platform-mcp-metadata-first.svg
top_img: /images/timeline/data-platform-mcp-metadata-first.svg
permalink: /2025/04/06/data-platform-mcp-metadata-first/
comments: false
---

<!-- generated: timeline-backfill -->

数据平台接入 MCP，最稳的起点是表结构、任务状态和日志检索，而不是直接重跑或修改生产任务。

![数据平台的 MCP 应从元数据查询开始](/images/timeline/data-platform-mcp-metadata-first.svg)

## 先看边界

Resources 暴露受权限过滤的表、任务和实例上下文，保持稳定 URI。

只读 Tools 提供条件查询和诊断证据，结果中携带对象 ID 与数据时间。

## 落地时我会盯住什么

写操作等评测和审计稳定后再开放，并要求幂等键与人工确认。

先让 Agent 看懂平台，再允许它改变平台，工程风险会低很多。

### 延伸资料

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18)
