---
wiki: agent-engineering
title: 工具与边界
permalink: /knowledge/agent/tools-and-boundaries/
description: AI Agent 工具最小权限、MCP Server 接口收敛、远程信任、Skill 边界与沙箱声明。
date: 2026-09-02 15:37:00
updated: 2026-09-02 15:37:00
robots: index,follow
sitemap: true
comments: false
---

## 工具不是多多益善

- {% post_link 2025-01-15-agent-tool-least-privilege "Agent 工具权限为什么要按任务临时授予" %}
- {% post_link 2025-04-04-mcp-server-narrow-surface "MCP Server 为什么要收窄工具面" %}
- {% post_link 2025-05-22-remote-mcp-trust-registry "Remote MCP 为什么需要信任注册表" %}
- {% post_link 2026-04-08-agent-sandbox-manifest "Agent 沙箱为什么需要显式能力清单" %}
- {% post_link 2026-04-15-agent-skill-explicit-boundary "Agent Skill 为什么要写清楚执行边界" %}

工具面越大，模型选错工具、越权执行和参数误用的概率越高。生产系统应当按任务授予最小能力，并把工具版本、权限范围和外部副作用写入可审计的能力清单。

远程 MCP 还要解决身份、版本和供应链信任。能建立连接，只能证明协议握手成功，不能证明对端工具值得执行。
