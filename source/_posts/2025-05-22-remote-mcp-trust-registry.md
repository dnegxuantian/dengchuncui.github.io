---
title: "远程 MCP 接入要有信任清单"
date: "2025-05-22 11:03:41"
updated: "2025-05-22 11:03:41"
categories:
- "AI Agent"
tags:
- "Remote MCP"
- "信任"
- "安全"
description: "模型平台开始支持远程 MCP 后，连接一个 Server 变得很容易，企业更需要知道这个服务由谁维护、能访问什么。 远程协议降低了接入成本，也把供应链信任问题推到了控制面。"
cover: /images/timeline/remote-mcp-trust-registry.svg
top_img: /images/timeline/remote-mcp-trust-registry.svg
permalink: /2025/05/22/remote-mcp-trust-registry/
comments: false
---

<!-- generated: timeline-backfill -->

模型平台开始支持远程 MCP 后，连接一个 Server 变得很容易，企业更需要知道这个服务由谁维护、能访问什么。

![远程 MCP 接入要有信任清单](/images/timeline/remote-mcp-trust-registry.svg)

## 架构判断

注册中心记录服务所有者、域名、认证方式、工具清单和数据等级。

首次连接与能力变更都进入审批，不能让 Server 动态新增高风险工具后自动生效。

## 留给运维的答案

出站请求做域名和网络策略限制，防止工具调用变成任意网络访问通道。

远程协议降低了接入成本，也把供应链信任问题推到了控制面。

### 延伸资料

- [OpenAI Responses API tools](https://openai.com/index/new-tools-and-features-in-the-responses-api/)
