---
title: "Remote MCP 接入要有信任清单：一个 URL 不能直接变成工具能力"
date: "2025-05-22 11:03:41"
updated: "2025-05-22 11:03:41"
categories:
- "AI Agent 工程化"
tags:
- "Remote MCP"
- "信任注册表"
- "供应链安全"
description: "在 Remote MCP 进入模型 API 后，为远端 Server 建立带 owner、域名、身份、scope、协议、能力与数据边界的 Trust Registry，并覆盖连接校验、会话快照、撤销和审计。"
cover: /images/articles/remote-mcp-trust-registry.svg
top_img: /images/articles/remote-mcp-trust-registry.svg
permalink: /2025/05/22/remote-mcp-trust-registry/
comments: false
editorial_standard: expert-v1
---

OpenAI 昨天宣布 Responses API 支持 remote MCP servers。对 Agent 平台来说，这会显著降低远端工具接入门槛，也带来一个直接问题：用户或模型提供的 MCP URL，能不能马上连接并把工具放进上下文？我的答案是否定的。

MCP 协议兼容只证明双方能交换消息，不证明 Server 的身份、代码、权限和数据处理值得信任。我会用 Trust Registry 把“发现一个 URL”与“允许某类用户在某类 Run 中连接”分开。

![Remote MCP 连接前的信任解析](/images/articles/remote-mcp-trust-registry.svg)

<!-- more -->

## Registry 保存的是信任声明

每个 Remote Server 使用稳定 registry ID，不让生产请求直接传任意 URL。注册项包含 owner、publisher、approved domains/IP policy、transport、auth type、allowed scopes、protocol versions、capability hashes、data classifications、regions、risk 和 review expiry。

URL 可以变化，身份不能只靠 URL。支持时验证 TLS certificate、服务身份或签名 metadata；至少把域名、证书/public key pin 策略与企业审批关联。Server 迁移域名是一次变更，不自动跟随重定向。

注册来源分内部自建、审核第三方和用户自托管。三类信任等级决定可访问的数据、可暴露工具和是否允许生产动作。Marketplace 热度、GitHub stars 或能通过 initialize 都不能替代企业审核。

registry entry 有版本与有效期。Server owner、隐私政策、scope 或工具列表变化，触发重新评审。过期后可只读隔离或停止新连接，不让一次审批永久有效。

## 连接时重新验证网络与协议

请求只提交 registry ID，gateway 解析当前批准 endpoint。DNS 解析前后、重定向目标和最终 IP 都检查，阻止 SSRF 到内网、loopback 和 cloud metadata。egress firewall 再做网络层兜底。

TLS 验证、hostname、certificate policy、HTTP status/content type 与 response size 都有上限。OAuth/token 由 gateway 的 secret manager 管理，不进入模型、Prompt 或 Server URL。

MCP initialize 协商 protocol version 与 capabilities。返回不支持版本、声明之外 capability 或未知 experimental feature 时，连接失败或按 allowlist 关闭。initialize 成功也只是协议通过，下一步仍按 registry policy 过滤 tools/resources/prompts。

会话保存 server identity、endpoint resolution、protocol/capability/tool-list hashes。Server 重连后重新校验，不沿用旧 snapshot；一次 Agent Run 则固定已批准 snapshot，避免中途工具漂移。

## 工具列表必须二次收窄

Server 列出的全部 Tools 不是模型可见列表。Host 按 tenant、user、workflow step、risk 与 registry allowlist 求交，只暴露当前需要的工具。新增 listChanged tool 先进入 quarantine/contract tests，新 Run 才能使用。

输入 schema 做静态检查：禁止过宽 additionalProperties、无上限字符串/数组、任意 URL/path/command 等高风险形态。description 扫描秘密和误导性权限声明，但文本扫描不作为唯一安全措施。

工具元数据补齐企业字段：action/resource type、permissions、side effect、idempotency、confirmation、timeout、output/error schema。MCP Server 没提供的内容由 registry overlay 定义，并与 tool hash 绑定。

Remote MCP Tools 在供应商 Responses API 内被模型选择时，企业网关仍要知道实际 call、用户同意和结果。provider-managed invocation 不应绕过 Host 的工具策略与审计；不支持所需控制的场景就不开放该 Server。

## 数据出域要逐调用判断

连接 Server 本身不代表允许发送所有对话。每次 resource read/tool call 检查将发送的字段、数据分类、目的、region 和 user consent。上一步从内部系统读取的 PII，不能因下一步工具是“搜索”就自动发送给第三方。

参数做 data label propagation。敏感 artifact 只传引用或脱敏摘要；Server 需要原文时，策略明确要求更高审批。响应也标来源与 trust level，不因通过 MCP 返回就变成可信 system instruction。

Server 返回 resource URI、embedded content 或外部链接时，不自动递归抓取。URI scheme/domain/size 经 allowlist，引用进入模型前保留 provenance。Prompt Injection 与恶意文件仍按不可信内容处理。

日志按字段脱敏。access token、Authorization、signed URL 和敏感 payload 不写普通 trace；审计保存 registry/tool、subject、data-class summary、policy decision 和下游 request ID。

## 撤销要比发布更快

发现 Server 被攻陷、域名接管、工具 schema 突变或数据处理违规时，registry 支持按 server、endpoint、certificate、tool 和 tenant 立即 deny。Gateway 每次调用检查 current revocation，不只在会话初始化时检查。

运行中的 operation 根据风险取消、冻结或继续对账。模型看到工具突然不可用时，返回明确 `SERVER_REVOKED`，不能自动寻找一个未经批准的替代 URL。

凭据轮换/撤销与 registry 联动，缓存和长连接清理。已获取的资源进入影响分析：哪些 Runs、answers、memories 和缓存引用该 Server，按 retention/security policy 隔离或重建。

恢复需新 registry version、重新契约/安全测试和灰度。不能只改回 allow=true，原 incident 的 Server binary、证书和 capability hashes 都要对上。

## 用探针和调用图持续验证

定期从批准网络执行 initialize、tools/list/resource read 的无敏感探针，检查身份、版本、schema、latency 和错误。探针成功不代表业务正确，但能发现域名、证书和协议漂移。

调用图统计哪些 users/Agents 调哪个 Server/tool、发送哪些数据分类、成功/拒绝/错误与成本。一个几乎没人用却拥有广泛 scopes 的 Server，应缩权或下线。

供应链变更进入监控：registry 配置、Server release、依赖漏洞与 publisher 变更。自托管 Server 固定 image digest，远端 SaaS 至少固定协议/tool contract 并设变化告警。

Remote MCP 让连接变简单，信任并不会随协议自动获得。用 registry 把 Server 身份、能力、数据边界和撤销机制做成显式资产，才能让生态扩张不等于攻击面无边界扩张。

## 对照官方资料与规范

- [OpenAI 2025-05-21：Responses API 支持 Remote MCP Servers](https://openai.com/index/new-tools-and-features-in-the-responses-api/)
- [MCP Specification：Host、Server、用户控制与工具安全](https://modelcontextprotocol.io/specification/2024-11-05)
- [MCP Lifecycle：版本和能力协商](https://modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
