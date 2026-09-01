---
title: "数据平台接 MCP，我会先开放元数据查询，而不是任务重跑"
date: "2025-04-06 19:40:45"
updated: "2025-04-06 19:40:45"
categories:
- "数据平台与 Agent"
tags:
- "MCP"
- "数据 Catalog"
- "元数据"
description: "为数据平台设计 metadata-first MCP：先开放实体搜索、表列、术语、函数和受控血缘查询，用只读链路验证身份、权限、证据、延迟与工具语义，再逐步扩展执行。"
cover: /images/articles/data-platform-mcp-metadata-first.svg
top_img: /images/articles/data-platform-mcp-metadata-first.svg
permalink: /2025/04/06/data-platform-mcp-metadata-first/
comments: false
editorial_standard: expert-v1
---

数据平台接 MCP 时，最吸引人的 Demo 是让 Agent 直接“重跑这个任务”或“补最近七天数据”。但执行链涉及对象歧义、生产权限、依赖、资源和覆盖风险，任何一层不成熟都会把模型错误变成真实操作。

我更愿意从元数据查询开始：找表、看字段、解释 owner、查函数、展开一两层血缘。它是低副作用场景，同时能逼出 MCP Server 最关键的基础能力：稳定对象身份、权限过滤、版本、新鲜度、分页和证据返回。

![数据平台 MCP 的低风险起步路径](/images/articles/data-platform-mcp-metadata-first.svg)

<!-- more -->

## 第一批能力围绕“找对对象”

`search_entities(query, type, environment, limit, cursor)` 负责模糊入口，返回权限过滤后的候选；`get_entity(guid, fields)` 返回确定实体；不要做一个 `ask_catalog(question)` 把搜索和答案都藏在 Server 内。

候选带 GUID、typeName、qualifiedName、display name、environment、owner、status、metadata version 和 match reason。同名表必须展示 cluster/database，模型不能只拿名字最高相似度。

Apache Atlas 的 Hive Hook 使用 `db.table@cluster` 作为 table qualifiedName，并用唯一属性去重。MCP Resource URI 可以直接围绕 GUID 设计，例如 `catalog://entities/{guid}`，展示名变化不影响引用。

搜索无结果返回 coverage/filters summary，不泄露无权对象。对象不存在与无权按策略统一错误，内部用 decision ID 区分。

## Resource 用于事实，Tool 用于查询关系

实体当前结构适合作 Resource：表列、描述、owner、分类、术语、source version、observed_at。Host 决定何时读取和放入模型上下文，答案引用稳定 URI/version。

血缘、搜索和带条件枚举需要 Tool，因为有方向、深度、类型和 limit 参数。`get_lineage(guid, direction, depth<=2, include_columns=false)` 比返回整个图安全、可控。

函数/UDF 可以按 Resource 暴露签名、参数、返回类型、示例和 engine version；搜索函数用 Tool。SQL Copilot 先 resolve 函数，再生成，避免模型凭名字猜方言。

MCP Prompts 可提供“查表并解释血缘”的用户入口，但 Prompt 不替代 system policy。模板引用 Resource/Tool 的方式可见、版本固定，不让远端模板扩展权限。

## 每个结果都要带证据边界

实体字段返回 source、collector、metadata version、observed_at 和 freshness。owner 缺失就返回 null + missing，不让 Server 或模型猜；多个来源冲突，返回 conflict candidates 与 authority。

血缘边带 process/query/run、collector、direction 和 confidence。静态 SQL 推断与运行 Hook 证据区分。路径中断时显示 gap，不把 A→B、B?C 自动说成 A 的确定下游是 C。

结果大小有限，分页 cursor 不让模型改写。超过深度提示缩小范围或提交异步查询。大 schema 可返回 columns resource 列表，而不是一个 Tool result 塞几千列。

答案 trace 记录使用的 MCP Server/protocol、tool/resource version 与 entity IDs。用户能从自然语言结论点回 Catalog 复核。

## 权限与新鲜度在只读阶段就验证

只读不等于公开。表存在性、字段名、owner 和血缘都可能敏感。MCP Host 携带可信 subject context，Server/底层 Catalog 两层鉴权；模型参数不能传 `user_id` 覆盖主体。

权限变更先失效 resource/query cache。缓存 key 包含 subject scope 和 policy version，不把管理员血缘复用给普通用户。Resource 引用点击时回源再次鉴权。

元数据采集会延迟。回答“当前 owner”时附 last observed；超过 domain freshness SLO，标 stale 或回源。MCP listChanged/subscribe 可以传更新信号，Host 仍需管理 index/cache 版本。

安全测试覆盖跨租户 GUID、猜测 qualifiedName、分页遍历、列级权限、血缘跨域、过期会话和 Server 直接绕过 Gateway。

## 先用真实问题评估 Server 设计

评测集来自 Catalog 搜索日志、数据开发工单和运维问题：同名表、中文业务别名、测试/生产、历史下线、缺 owner、断血缘、函数版本。标注目标 GUID、允许关系和权限主体。

指标先看 entity top-k、歧义识别、evidence completeness、权限违规、latency 与 tool calls。自然语言好不好看放在后面。对象找错时，后续 SQL/重跑越自动越危险。

Trace 观察工具粒度。若每次找一张表都要六次调用，可能缺组合只读查询；若一个调用返回全 Catalog，接口过宽。根据真实任务调整，不凭 schema 数量评价 MCP Server。

Connector/Server 故障也要可恢复：initialize、search、read、lineage 各自 timeout/error，Host 不把旧结果冒充当前；unknown result type 保留原生证据并失败。

## 执行能力按风险逐级开放

metadata 链路稳定后，下一步是 SQL plan/preview：生成候选、真实 parser/catalog/EXPLAIN，不直接运行。再开放只读查询代理，设置资源与结果限制。

任务运维先 read instance/log/status，再 dry-run rerun plan，最后才是绑定审批和 idempotency 的 execute。每升一级都新增 policy、operation state、回读验证与回归集。

同一个 MCP Server 不必同时承担 Catalog 与生产执行。按安全域拆 Server/credential，Host 可在分析 Run 只连接 metadata Server。即使执行 Server 出问题，读取面不需要跟着扩大权限。

数据平台 MCP 的第一价值，是把已有元数据和工具用标准方式交给 Agent；第一风险，是把平台内部广泛能力过早端出去。metadata-first 能用低副作用问题验证身份、协议和证据链，也为后续 SQL 与运维动作提供准确对象基础。

## 对照源码与官方规范

- [MCP 2024-11-05 Specification：Resources、Prompts、Tools 与 Host 责任](https://modelcontextprotocol.io/specification/2024-11-05)
- [MCP 2024-11-05 Server Overview：三类 Server primitives](https://modelcontextprotocol.io/specification/2024-11-05/server/index)
- [Apache Atlas 2.2.0 Hive Hook：实体属性与 qualifiedName](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/docs/src/documents/Hook/HookHive.md#L18-L56)
- [Apache Atlas 2.2.0 `SearchParameters`：类型、术语、分类与过滤](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/intg/src/main/java/org/apache/atlas/model/discovery/SearchParameters.java#L41-L127)
