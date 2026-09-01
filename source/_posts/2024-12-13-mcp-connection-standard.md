---
title: "MCP 带来了什么：统一连接协议，不等于统一权限系统"
date: "2024-12-13 15:38:11"
updated: "2024-12-13 15:38:11"
categories:
- "AI Agent 工程化"
tags:
- "MCP"
- "Agent 工具"
- "连接协议"
description: "基于 2024-11-05 版 Model Context Protocol 规范，拆解 Host、Client、Server、生命周期、能力协商、Resources/Prompts/Tools，并说明企业治理仍需补齐的权限与审计。"
cover: /images/articles/mcp-connection-standard.svg
top_img: /images/articles/mcp-connection-standard.svg
permalink: /2024/12/13/mcp-connection-standard/
comments: false
editorial_standard: expert-v1
---

Anthropic 在 11 月 25 日公开 Model Context Protocol（MCP）后，Agent 连接数据和工具终于有了一套开放协议。它解决的核心问题很实际：每个 AI 应用不必为每个数据源重复写私有集成，Server 可以用统一方式暴露 resources、prompts 和 tools。

但 MCP 是连接与能力发现协议，不会替企业完成对象权限、审批、数据分级和副作用治理。我会把 MCP Client/Server 放进现有 Agent Gateway，而不是让发现到的 Server 直接获得执行权。

![MCP 连接层与企业治理层](/images/articles/mcp-connection-standard.svg)

<!-- more -->

## Host、Client、Server 先分清责任

2024-11-05 版规范中，Host 是运行 LLM 应用、管理用户交互和多个连接的应用；Client 是 Host 内与一个 Server 建立协议连接的组件；Server 提供上下文和能力。

这个分层很重要。用户身份、哪些 Server 可连接、哪些数据能发给模型、是否确认工具调用，都属于 Host 的产品与安全责任。Server 声明自己有某个 tool，不代表当前用户自动有权使用。

每个 Client-Server 连接有独立 session/capabilities。一个 Server 的资源与另一个 Server 的工具不能在 Host 中无条件组合；跨 Server 数据流动仍要经过数据策略。例如把内部文档内容发给外部搜索 Server，MCP 格式合法也可能违反数据边界。

企业侧维护 Server registry/allowlist，记录 owner、发布来源、版本、transport、身份方式、数据分类和风险。用户给一个任意启动命令或 URL，不能直接成为受信 Server。

## Initialize 是协议版本与能力协商

规范要求连接先发送 `initialize`，双方协商 protocolVersion、capabilities 和 implementation info，随后 Client 发送 initialized notification。初始化完成前不能随意调用其他方法。

Client 必须验证 Server 返回的版本自己支持；能力只使用已协商集合。Server 没声明 tools，就不能因为它恰好响应 `tools/list` 而调用。未知 experimental capability 默认关闭，通过 allowlist 显式开启。

初始化与每个请求都有 timeout。stdio 子进程可能卡住，HTTP 连接也可能半开。生命周期关闭时释放进程、连接和订阅，不能让一个坏 Server 长期占资源。

协商结果与 Server binary/image hash 写入 connection trace。运行中 Server 列表变化或重启后，重新初始化，不能沿用旧 capabilities 假定。

## Resources、Prompts、Tools 的控制者不同

规范把三类 Server 能力分开：resources 是应用控制的上下文数据，prompts 是用户选择的模板，tools 是模型可发现和调用的函数。这种区别比“所有东西都是函数”更清楚。

Resources 用 URI 标识，可读取或订阅。URI 是协议身份，不自动等于授权。Host 在读取前检查用户与 Server scope，内容进入模型前保留来源、mime type、版本和 trust label。订阅更新还要处理权限撤销与缓存失效。

Prompts 返回模板/消息，仍是 Server 提供的数据。Host 不应把远端 prompt 当成最高优先级 system policy，也不允许它覆盖用户身份和工具规则。不可信 Server prompt 与网页内容有相同注入风险。

Tools 包含 name、description 和 inputSchema，调用用 `tools/call`。Client 仍要做 schema、对象、权限、确认、幂等和结果验证。规范安全说明也强调工具代表任意代码执行能力，应用应让用户看见并控制调用。

## 传输安全与工具安全是两件事

stdio Server 在本机进程运行，风险是它继承的文件、环境变量和网络权限；HTTP Server 涉及服务身份、TLS、token、租户和网络边界。MCP 统一消息，不会自动沙箱进程或替你认证远端。

本地 Server 用最小环境启动，秘密按 Server 单独注入，文件系统和 egress 受限。不要把整个 shell 环境传给第三方 Server。binary 来源、签名/hash 与升级记录进入 registry。

远端连接通过企业 gateway，token 不暴露给模型，Server 不能自行请求扩大 scope。每个 request 关联 user/session/run，policy 在 Host 与业务工具端双重检查。

Server 返回的 text/resource/error 均视为不可信数据。它可以影响模型候选，不可以绕过 Host 策略触发另一个工具。嵌入 resource 的内容也需按 URI 重新鉴权和限制大小。

## Tool List 变化需要版本控制

规范支持 `listChanged` capability/notification。收到变化通知后，Client 重新拉列表，但不应直接把新工具塞进运行中的 Agent。先验证 schema、registry policy 与 Bundle compatibility，新 Run 才使用新 snapshot。

同名工具 schema 改变要视为新 capability version。MCP 初始工具模型只有 name/description/inputSchema，企业 registry 还要补 output/error、risk、permissions、idempotency、owner 与 implementation version。

一次 Run 保存 server ID、protocol version、capabilities hash 和 tool list hash。故障回放才能知道模型当时看见哪些工具。Server 重启后定义漂移，没有这些 hash 很难解释参数为何突然无效。

弃用先查哪些 Agent Bundles 和未完成 Runs 仍引用。紧急安全禁用在 Host policy 立即生效，即便 Server 继续列出该工具。

## 把 MCP 当适配层，不当治理终点

企业平台可以用 MCP 接入 Catalog、Git、数据库与工单，但 Server 端最好仍封装窄业务能力。把通用 SQL、shell 或任意 HTTP 暴露出来，只是用标准协议扩大了危险面。

Gateway 统一观测 initialize、list/read/call、progress、cancel、errors 和 connection lifecycle，并与 Agent run、policy decision、operation ID 关联。原生 JSON-RPC 与归一化工具事件双轨保存。

契约测试覆盖版本不匹配、能力缺失、分页、listChanged、timeout、取消、malformed result、未知 content type 和 Server 中途退出。只验证能连上，不足以进入生产。

MCP 的意义，是让上下文和工具连接从 N×M 私有适配走向共同协议。它能降低集成成本，真正的可信执行仍取决于 Host 的用户控制、企业网关的权限与审计、工具本身的状态和副作用契约。把这两层分开，才既能享受生态，又不把标准连接误当安全认证。

## 对照官方规范

- [Anthropic 2024-11-25：Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)
- [MCP 2024-11-05 Specification：架构、能力与安全原则](https://modelcontextprotocol.io/specification/2024-11-05)
- [MCP 2024-11-05 Lifecycle：initialize、版本和能力协商](https://modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle)
- [MCP 2024-11-05 Tools：tools/list、tools/call 与安全考虑](https://modelcontextprotocol.io/specification/2024-11-05/server/tools)
