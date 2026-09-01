---
title: "Agent 工具默认最小权限：能力要按 Run 和 Step 临时授予"
date: "2025-01-15 09:23:36"
updated: "2025-01-15 09:23:36"
categories:
- "AI Agent 工程化"
tags:
- "最小权限"
- "Agent 工具"
- "MCP"
description: "把 Agent 工具权限从长期服务账户拆成按 Run/Step 发放的短时 Capability，通过用户、Agent 与工具策略求交，限制动作、对象、时间、预算和数据范围。"
cover: /images/articles/agent-tool-least-privilege.svg
top_img: /images/articles/agent-tool-least-privilege.svg
permalink: /2025/01/15/agent-tool-least-privilege/
comments: false
editorial_standard: expert-v1
---

Agent 接了十个工具后，最省事的做法是给运行服务一个能访问十套系统的账户，再靠 Prompt 告诉模型“只做用户允许的事”。这会把服务账户的最大权限变成每次对话的潜在权限，任何 Prompt Injection、对象误选或编排 bug 都能放大影响。

我希望权限按 Run 和 Step 临时收敛。当前用户、当前任务、当前步骤真正需要什么能力，就签发什么短时 capability。服务账户只是基础设施连接身份，不代表模型自动拥有它能做的所有事。

![Agent 工具权限按 Run 和 Step 收敛](/images/articles/agent-tool-least-privilege.svg)

<!-- more -->

## 最小权限先从工具可见性开始

研究文档的 Step 只需要 search/read，不应该向模型暴露 send、delete、deploy。生成变更计划需要 preview，不需要 execute。工具列表越小，误选和注入后的路径越少，Prompt token 也更省。

可见性由 orchestrator 根据 workflow node 与 policy 生成，不让模型自己请求“把管理员工具加进来”。需要新能力时，模型返回 capability request，外层根据任务定义和用户授权决定是否进入新 Step。

隐藏工具仍不是安全边界。攻击者可以绕过模型直调接口，因此工具服务按每次请求携带的 capability 与主体再次验证。模型看不见和后端拒绝，两层都要有。

MCP 2024-11-05 规范区分 resources、prompts、tools，并明确 Host 负责用户同意与控制。Server 能列出一个工具，只表示协议可发现，不表示 Host 应把它暴露给当前模型或允许调用。

## 权限是三份策略的交集

一次有效能力来自 `user permission ∩ agent/workflow policy ∩ tool/resource policy`。用户也许有生产发布权，但这个“只读分析 Agent”按设计没有；Agent 允许查询，目标数据域又要求特定 purpose，仍可能拒绝。

策略输入包括 subject、tenant、action、resource ID/type、environment、resource state、purpose、risk、time 和 requested scope。输出包含 allow/deny、obligations、expiry、limits 与 decision ID。

角色只能提供初始权限集合，具体对象和上下文用属性判断。NIST ABAC 把 subject、object、action 和 environment attributes 纳入授权，这比“用户是不是管理员”更适合多租户 Agent。

拒绝默认生效。缺 owner、无法解析环境、policy service 超时等不确定状态，不降级成 allow。普通只读公开信息可配置 last-known-good，生产动作与敏感数据 fail closed。

## Capability 绑定动作、对象和预算

短时 capability 至少包含 subject、run/step、tool/action、resource scope、allowed fields、constraints、expiry、max calls 和 policy version，并由可信网关签名。工具验证签名和 audience，不接受模型生成的 token 字符串。

对象 scope 使用稳定 IDs 或受控集合，不用 `project_name=*`。批量场景先 preview 展开具体对象清单并 hash；执行时若清单变化，需要新授权。

约束还包括数据量、结果行数、时间范围、网络目标与成本。一个 read capability 可以只允许查看任务摘要，不能下载原始日志；query capability 限定 catalog/schema 与最大扫描量。

capability 不含长期凭据。工具网关根据它换取/选择后端身份，token 在 expiry 或 Run 结束后撤销。即使对话记录泄露，也不能长期复用。

## 写、读和元数据发现分开

“查看任务”包含对象是否存在、配置、日志和运行结果，敏感级别并不相同。Discover 工具只返回授权候选，Read Summary 返回有限字段，Read Full Logs 需要额外 scope。

写操作拆 preview 与 execute。preview 使用只读 capability，返回目标、版本、影响和 plan hash；execute capability 只有在确认/审批后签发，并绑定 plan hash。用户取消或计划过期立即失效。

对于数据库，模型没有连接凭据。查询代理使用只读 role、事务只读、timeout 和行列策略。生产 DDL/DML 不因为用户拥有数据库账号就暴露给 Agent；它们进入已有变更系统。

跨工具数据流也要限制。读取客户数据后调用外部搜索工具，单个工具权限都允许，但组合违反数据出域策略。Run 的 data labels 随 artifacts 传播，下一工具策略检查 input classifications。

## Delegation 不能无界继承

多 Agent/worker 场景里，主 Agent 给子任务的能力必须是自身 capability 的子集，且 scope 更窄、expiry 不更长。worker 不能再委派未被允许的工具。

交接 manifest 写 objective、allowed tools、resource scopes、budget 和 completion criteria。子 Agent 返回 artifact，不返回可继续使用的原 capability。需要后续动作由 orchestrator 重新授权。

MCP Server 发起 sampling 或返回另一个 resource URI 时，Host 仍重新检查。协议中的双向能力不应变成 Server 代表用户递归扩权。

delegation chain 进入审计：谁根据哪个 policy 把哪份能力授予哪个 worker。发现异常可以按 capability ID 或 Server ID 撤销，不必关停整个 Agent 平台。

## 审计与回归验证最小权限是否真的生效

每次工具 proposal 记录当时可见 tool set、capability request、policy decision、issued token ID、工具验证结果和 operation。只记录成功调用，看不到模型是否反复请求过界能力。

指标包括 exposed tools per step、granted/denied scope、unused capabilities、permission failures、capability expiry、跨域 data-flow deny。长期未使用能力从 workflow policy 删除，不让权限只增不减。

安全回归用例直接调用工具接口，伪造 subject、修改 resource、扩大时间范围、复用过期 token、跨 Run 使用、确认后换参、子 Agent 再委派。不能只从聊天入口测试。

最小权限不会让 Agent 永不犯错，但能把一次错误限制在当前步骤和对象内。工具越强、运行越自主，这种临时、可撤销、可审计的 capability 越重要。把长期服务权限直接交给模型，是方便一时，把整个系统的 blast radius 留给未来事故。

## 对照规范与资料

- [MCP 2024-11-05 Specification：用户同意、数据隐私与工具安全原则](https://modelcontextprotocol.io/specification/2024-11-05)
- [MCP 2024-11-05 Tools：模型控制工具与人类可拒绝调用](https://modelcontextprotocol.io/specification/2024-11-05/server/tools)
- [NIST SP 800-162：Attribute Based Access Control](https://csrc.nist.gov/publications/detail/sp/800-162/final)
- [OWASP Authorization Cheat Sheet：最小权限、deny by default 与逐请求校验](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
