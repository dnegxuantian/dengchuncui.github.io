---
title: "MCP 的价值在连接层标准化"
date: "2024-12-13 21:55:18"
updated: "2024-12-13 21:55:18"
categories:
- "AI Agent"
tags:
- "MCP"
- "工具调用"
- "上下文"
description: "MCP 发布后最值得关注的不是又多了一个 Agent 框架，而是客户端与数据、工具之间开始有统一连接层。 MCP 解决的是怎么连接，生产化仍取决于连接后是否可控、可观测、可撤销。"
cover: /images/timeline/mcp-connection-standard.svg
top_img: /images/timeline/mcp-connection-standard.svg
permalink: /2024/12/13/mcp-connection-standard/
comments: false
---

<!-- generated: timeline-backfill -->

MCP 发布后最值得关注的不是又多了一个 Agent 框架，而是客户端与数据、工具之间开始有统一连接层。

![MCP 的价值在连接层标准化](/images/timeline/mcp-connection-standard.svg)

## 我会先看三组证据

Resources 适合暴露可读取上下文，Tools 表达可执行能力，两者的权限与风险不同。

Server 负责能力边界，Host 负责用户授权和上下文组织，不能把安全责任全推给协议。

## 取舍

企业接入先做只读资源与低风险工具，验证身份、超时和审计后再扩大。

MCP 解决的是怎么连接，生产化仍取决于连接后是否可控、可观测、可撤销。

### 延伸资料

- [Anthropic: Introducing MCP](https://www.anthropic.com/news/model-context-protocol)
