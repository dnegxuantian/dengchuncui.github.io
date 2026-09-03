---
title: "MCP Server 设计先收窄能力面：不要把 Shell、SQL 和 HTTP 直接端出去"
date: "2025-04-04 18:30:03"
updated: "2025-04-04 18:30:03"
categories:
- "AI Agent 工程化"
tags:
- "MCP Server"
- "工具设计"
- "Agent 安全"
description: "从 MCP 的 Resources、Prompts、Tools 三类能力出发，设计窄 MCP Server Facade，限制通用 Shell、任意 SQL、URL、路径和 JSON Patch 的攻击面。"
cover: /images/articles/mcp-server-narrow-surface.svg
top_img: /images/articles/mcp-server-narrow-surface.svg
permalink: /2025/04/04/mcp-server-narrow-surface/
comments: false
editorial_standard: expert-v1
---

MCP Server 很容易从“先把能力接出来”变成一个通用执行面：提供 `run_command`、`query_sql`、`http_request`、`read_file(path)`，模型似乎什么都能做。开发效率高，安全和可验证性却都变差，因为一个字符串参数就能跨越大量对象和副作用。

我会把 MCP Server 当成业务 Facade，不是内部 API 的透明代理。Resources 用稳定 URI 暴露受控上下文，Tools 表达窄业务动作，Prompts 只是用户可选模板。通用能力留在受限开发环境，不作为企业生产 Server 的默认接口。

![MCP Server 从窄能力面开始](/images/articles/mcp-server-narrow-surface.svg)

<!-- more -->

## Resources 优先表达可读对象

表定义、任务配置、运行摘要、工单详情更适合 Resource。URI 例如 `catalog://entities/{guid}`、`jobs://instances/{id}/summary`，身份稳定、mime type 明确，可被 Host 决定何时加入上下文。

不要用 `file:///` 加任意 path 暴露整个文件系统。Server 内部把 URI 映射到授权对象，校验 tenant、resource ID 和当前 subject；路径遍历、符号链接与根目录边界由代码处理。

列表和读取分开，支持 pagination、过滤和大小限制。一个 resource 过大时返回摘要/分段 URI，不把几百 MB 日志直接塞给模型。内容带 version、observed_at、ACL 与 truncation 标志。

订阅/listChanged 变化经过 Host snapshot 管理。Resource 更新不应在一次 Run 中悄悄替换已有 evidence，需要显式刷新 step。

## Tools 只暴露有业务含义的动作

`execute_sql(sql)` 既能查表也可能调用副作用函数，权限范围隐藏在字符串里。更窄的工具可以是 `preview_metric(metric_id, dimensions, time_range)`、`get_table_sample(table_id, limit)`，由服务端生成/校验查询。

`run_command(command)` 换成 `run_named_diagnostic(check_id, resource_id)`；`http_request(url, body)` 换成 `get_ticket(ticket_id)`、`create_draft_comment(...)`；`update_object(json_patch)` 换成明确字段与状态前置的动作。

每个 Tool 的 inputSchema 关闭 additionalProperties，参数限制长度、枚举、数量、时间与对象类型。Tool 结果返回结构化 status/data/error/evidence，不让模型从自由日志猜结论。

MCP 规范中 Tool 是模型控制的协议 primitive，并建议 Host 提供清晰 UI 和人在环控制。Server 本身仍需鉴权和副作用保护，不能认为 Host 一定会正确使用。

## Prompts 不能升级成远端系统指令

MCP Prompt 是 Server 提供、由用户选择的模板。它适合暴露“诊断失败任务”“解释表血缘”这样的入口，但不应该包含秘密，也不能要求 Host 绕过自身 policy。

Host 把远端 Prompt 当不可信模板数据，展示来源与内容；system policy、用户身份和工具边界仍由 Host 控制。第三方 Server 返回“忽略所有确认”只是文本，不具有更高优先级。

Prompt arguments 也做 schema、长度和权限检查。模板渲染避免任意代码执行，资源引用通过受控 URI 解析。更新 Prompt 发布新 Server/capability version，正在运行的 Bundle 不漂移。

Prompts 不应成为工具调用的隐藏通道。需要动作就用 Tool proposal 和明确确认，不能在模板里让模型输出一段特殊字符串，由 Server 解释为命令。

## Server Facade 负责协议外的治理

MCP 统一 JSON-RPC、生命周期和能力发现，没有替业务系统定义用户身份、对象权限、幂等和审批。Facade 将 Host 传来的可信 subject/delegation 映射到内部策略，并在目标服务再次鉴权。

每个请求有 timeout、max result bytes、rate/cost limit 和 cancellation。stdio Server 运行在受限进程，最小文件/网络/环境变量；HTTP Server 有 TLS、服务身份、tenant 隔离和 egress policy。

秘密从 Server runtime 的 secret manager 获取，不出现在 tool schema、日志和结果。不同上游系统使用不同 credential profile，撤销一个不会影响全部能力。

Facade 记录 MCP request ID、run/tool call、server/tool version、subject、policy decision、下游 operation 和 raw/normalized result。错误只暴露稳定 code，内部堆栈通过 evidence ref 受控查看。

## 粒度过细与过宽都要测

工具太宽风险大，太细会让模型为简单目标连续调用几十次，增加成本和失败点。粒度围绕可独立授权、可验证、可幂等的业务动作，而不是每个数据库方法一个 Tool。

观察真实 traces：模型经常按固定顺序调用三四个只读工具，可以组合成一个查询型 tool/resource view；经常因参数歧义失败，拆出 resolve/preview；一个工具包含多个风险不同分支，则继续拆窄。

组合工具仍保留内部步骤证据。`diagnose_job` 可以收集状态、日志摘要和资源指标，但不能顺便自动重跑。诊断与修复的权限、确认和副作用不同。

评测包括 tool selection、参数、对象歧义、权限、timeout、结果大小和 Prompt Injection。单纯 `tools/list`/`tools/call` 成功不代表设计适合模型。

## Server 发布需要清单与契约测试

Server registry 保存来源、owner、binary/image hash、protocol versions、capabilities、tools/resources/prompts hashes、权限和数据分类。未知 Server 默认不连接，更新先扫描与测试。

契约测试覆盖 initialize/version mismatch、分页、listChanged、malformed input/result、取消、慢响应、Server crash、重复 request 与未知 content type。Tool 的业务 sandbox 还测试幂等、状态冲突和结果回读。

紧急禁用能按 Server、Tool 或资源域生效。Host 即便收到旧 list，也在调用前查 current deny policy。弃用先检查哪些 Bundles/未完成 Runs 仍引用。

MCP 降低了连接成本，也让一个能力更容易进入多个 Agent。正因为复用范围扩大，Server 接口更需要窄、稳定、可授权。把通用命令包装成标准协议不会自动变安全，业务 Facade 才是生产边界。它在完整系统里的位置，可以回到[数据平台 Agent 可验证执行总纲](/2026/08/20/data-platform-agent-verifiable-execution/)继续看；授权以后由谁推进操作，则要靠 [Agent Trace 的责任分层](/2025/03/20/agent-trace-decision-owner/)说明白。

## 对照官方规范

- [MCP 2024-11-05 Specification：Host、Client、Server 与安全原则](https://modelcontextprotocol.io/specification/2024-11-05)
- [MCP 2024-11-05 Server Overview：Prompts、Resources、Tools 的控制模型](https://modelcontextprotocol.io/specification/2024-11-05/server/index)
- [MCP 2024-11-05 Tools：发现、调用、结果与用户交互](https://modelcontextprotocol.io/specification/2024-11-05/server/tools)
- [OWASP SSRF Prevention Cheat Sheet：任意 URL 与网络访问风险](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
