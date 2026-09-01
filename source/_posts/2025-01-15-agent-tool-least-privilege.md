---
title: "Agent 工具默认最小权限"
date: "2025-01-15 09:23:36"
updated: "2025-01-15 09:23:36"
categories:
- "AI Agent"
tags:
- "最小权限"
- "工具调用"
- "安全"
description: "Agent 能连续调用工具以后，一次错误判断可能跨多个系统放大。默认权限必须比普通后台账号更窄。 最小权限不是降低 Agent 能力，而是让错误停在可恢复的范围内。"
cover: /images/timeline/agent-tool-least-privilege.svg
top_img: /images/timeline/agent-tool-least-privilege.svg
permalink: /2025/01/15/agent-tool-least-privilege/
comments: false
---

<!-- generated: timeline-backfill -->

Agent 能连续调用工具以后，一次错误判断可能跨多个系统放大。默认权限必须比普通后台账号更窄。

![Agent 工具默认最小权限](/images/timeline/agent-tool-least-privilege.svg)

## 架构判断

1. 按任务签发短期凭据，只允许访问当前项目与对象，运行结束立即失效。
2. 读、写、删除和审批分成不同工具，避免一个万能接口承载全部风险。
3. 高风险调用返回待确认计划，确认内容包含对象、参数和影响范围。

## 留给运维的答案

最小权限不是降低 Agent 能力，而是让错误停在可恢复的范围内。

### 延伸资料

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18)
