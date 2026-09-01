---
title: "企业 Agent 缺的是统一工具接口"
date: "2024-11-20 18:10:20"
updated: "2024-11-20 18:10:20"
categories:
- "AI Agent"
tags:
- "工具接口"
- "企业集成"
- "Agent"
description: "每接一个 Agent 都为数据库、文档和工单系统重写一套插件，规模一上来就会形成新的集成孤岛。 统一接口真正减少的是重复集成成本，不会自动解决工具本身的安全与质量。"
cover: /images/timeline/enterprise-agent-tool-interface.svg
top_img: /images/timeline/enterprise-agent-tool-interface.svg
permalink: /2024/11/20/enterprise-agent-tool-interface/
comments: false
---

<!-- generated: timeline-backfill -->

每接一个 Agent 都为数据库、文档和工单系统重写一套插件，规模一上来就会形成新的集成孤岛。

![企业 Agent 缺的是统一工具接口](/images/timeline/enterprise-agent-tool-interface.svg)

## 架构判断

工具描述、发现、调用和结果返回需要稳定协议，业务能力才能被不同模型复用。

### 实施时

- 协议只解决连接方式，身份传递、对象权限和审计仍由企业平台负责。
- 优先把高频只读能力标准化，再逐步开放有副作用的动作。

## 留给运维的答案

统一接口真正减少的是重复集成成本，不会自动解决工具本身的安全与质量。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
