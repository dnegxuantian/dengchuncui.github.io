---
title: "Agent 权限审计为什么要还原当时策略：只看今天的角色没有意义"
date: "2025-12-13 18:16:07"
updated: "2025-12-13 18:16:07"
categories:
- "AI Agent 工程化"
tags:
- "权限审计"
- "策略快照"
- "最小权限"
description: "设计可追溯的 Agent 授权证据：固化主体、委托链、资源、动作、参数、策略版本和审批决定，让事后审计能复现执行当时为什么被允许。"
cover: /images/articles/agent-permission-policy-snapshot.svg
top_img: /images/articles/agent-permission-policy-snapshot.svg
permalink: /2025/12/13/agent-permission-policy-snapshot/
comments: false
editorial_standard: expert-v1
---

一次 Agent 删除了错误的数据分区。事故复盘时，审计平台拿当前角色去查，结论是“没有删除权限”。这并不能证明当时的请求被拦截，也不能说明是谁授权的：角色、组织关系、策略和资源标签可能都已变化。

权限审计要回答的是历史问题：在那一刻，哪个主体代表谁，以什么目的，对哪个版本的资源发起了什么动作，策略根据哪些事实作出允许或拒绝。只存用户名和 HTTP 200，根本还原不了这条链。

![Agent 权限决定与策略快照](/images/articles/agent-permission-policy-snapshot.svg)

<!-- more -->

## 一次调用至少有三类身份

企业 Agent 很少只有一个“用户”。首先是发起任务的人或服务主体，其次是代表用户运行的 Agent/应用，最后是实际调用工具的 Worker 或 MCP Server。它们形成委托链，但权限不能简单求并集。

我会在 Run 中保存 `actor`、`agent_client`、`workload_identity` 与 tenant，同时保存 delegation/consent 的范围和期限。业务系统最终授权时既校验用户权限，也校验调用应用可执行的动作。用户能删表，不代表任意接入的 Agent 都能替他删表。

共享服务账户最容易破坏审计。所有请求在下游都显示 `agent-prod`，上层传来的用户 ID 只是可伪造 header，业务系统无法确认委托。更稳妥的做法是签名的身份上下文、短期 token、明确 audience，并由服务端重新做对象级授权。

MCP 或工具代理不能把收到的 token 原样透传给任意下游。token 应绑定目标资源服务；代理调用上游 API 时使用面向该 API 的独立凭证，并保留原主体与委托关系。否则一个合法 token 会跨越原本的信任边界。

## Authorization Decision 是审计主记录

每个敏感 Operation 在执行前生成 `decision_id`，记录 subject、tenant、resource type/id/version、action、参数摘要、环境属性、policy/model version、decision、reason codes、obligations 与决策时间。工具执行事件引用该 decision。

只记角色名不够。RBAC 角色可能改成员，ABAC 依赖部门、数据等级、环境、时间和资源标签，ReBAC 依赖当时的关系图。审计记录应保存输入事实的规范化摘要，并能从不可变版本重放；涉及隐私的大字段可存 hash 与受控快照引用。

授权模型使用不可变 ID 很实用。每次修改生成新版本，决策明确引用 `authorization_model_id`；策略包、数据字典和资源标签也同理。当前策略用于新请求，历史审计用当时版本，二者不能混查。

`allow` 不是唯一输出。策略还可以要求二次审批、字段脱敏、行数上限、只生成预览、不允许导出、只能在沙箱执行。这些 obligations 必须进入工具参数和结果校验；只在前端显示一句警告不算执行约束。

## 权限应落到对象、动作和参数

“可使用数据库工具”太粗。一个工具可能包含列元数据查询、SELECT、DDL、导出和任务提交。权限至少分到 tool action，并结合目标对象。读取公开指标与查询客户明细的风险不在一个级别。

参数还会改变风险。SQL 工具的库表、查询类型、结果行数和导出目标；消息工具的收件人、群范围和是否外部联系人；任务工具的环境、业务日期与并发，都应参与决策。不能仅凭工具名在调用前放行，然后让模型自由填任何参数。

对象解析必须先于审批。用户说“昨天的订单任务”，Agent 先解析成稳定资源 ID、环境和版本，再展示给人。审批记录绑定这组规范化对象与参数 hash；模型后来换了 SQL 或资源，必须重新决策。

批量操作不要把一万个对象藏在一个模糊 `scope=all`。可用 manifest 固化对象集合和摘要，策略限制数量、分区范围与总影响，执行结果逐对象关联。这样既能防越界，也能知道部分成功后该补偿什么。

## Snapshot 不是复制整套权限数据库

完整复制身份、关系和策略成本高，也会扩大敏感数据暴露。我更倾向保存“可验证决策包”：不可变策略版本、决策输入事实、外部关系读取版本、最终 reason，以及能证明原记录未被篡改的 hash/签名。

如果授权引擎支持历史读取，保存 tuple/relation revision；不支持时，对高风险决策保存最小事实快照。低风险只读可保留版本和摘要，高风险写操作保留更完整的证据。保留周期按合规和事故追溯要求分级。

时钟也要可信。Agent、权限服务与工具的时间偏差会造成“先执行、后授权”的假象。事件使用服务端接收时间和单调序号，跨系统通过 trace/operation/decision IDs 关联；必要时记录签名日志的批次根。

策略日志本身要防滥用。管理员能查审计不意味着能看所有原始参数；访问审计日志也要授权、留痕和脱敏。否则为追责建立的数据集合，反而成为新的敏感信息出口。

## 权限变化时，长任务必须重新判断

Run 创建时固定权限快照，不代表可以执行几天。长期研究任务可以用创建时权限决定允许读取的初始输入，但每次产生外部副作用前要检查当前主体状态、资源版本和撤销信号。

这需要同时保留两份证据：任务开始时的 policy context，以及 Operation 执行前的 fresh decision。用户离职、角色撤销、资源升密或审批过期后，旧 Run 不得继续沿用缓存的 allow。

缓存授权决定必须把 subject、resource、action、parameter class、policy version 和关系 revision 都纳入 key，并设置短 TTL/撤销机制。缓存命中也写 decision reference，不能让审计链断在本地内存。

我会做三类回归：同一历史输入在旧策略版本上重放，结果必须一致；新策略对基准权限矩阵不能意外扩权；从 Agent trace 随机抽一个工具操作，必须能一路查到主体、对象、策略、审批和实际结果。

权限系统的价值不是事故后给出一个“当前不允许”。它应在执行前守住边界，并在执行后留下足以复现当时判断的证据。Agent 越能调用真实系统，这条历史授权链越不能省。

## 对照资料

- [OpenFGA：Authorization Model 的不可变版本](https://openfga.dev/docs/getting-started/cli)
- [Open Policy Agent：Policy Decision Logs](https://www.openpolicyagent.org/docs/management-decision-logs)
- [MCP Authorization：资源绑定与 token audience](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Google Zanzibar：面向全球规模的一致授权系统](https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/)
