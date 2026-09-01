---
title: "Agent Trace 要能回答：这一步到底是谁做的决定"
date: "2025-03-20 13:14:52"
updated: "2025-03-20 13:14:52"
categories:
- "AI Agent 工程化"
tags:
- "Agent Trace"
- "决策审计"
- "责任边界"
description: "把 Agent 运行中的用户意图、模型 Proposal、策略授权、人工确认、编排决策与工具 Operation 分开记录，让每一步的决定者、依据和实际结果可追踪。"
cover: /images/articles/agent-trace-decision-owner.svg
top_img: /images/articles/agent-trace-decision-owner.svg
permalink: /2025/03/20/agent-trace-decision-owner/
comments: false
editorial_standard: expert-v1
---

Agent Trace 如果只记录“模型调用了 rerun_job”，事故复盘时会留下一个模糊结论：是模型决定重跑，还是工作流规则要求重跑，用户是否确认，权限系统为何允许，后端到底有没有执行成功？这些责任不能压进同一个 tool call span。

我会把建议、授权、编排选择、人工批准和实际操作拆成不同 Decision/Operation 事件。每条记录 actor、输入快照、规则或模型版本、证据与结果。这样可以回答“谁在什么依据下推进了哪一步”。

![Agent Trace 中的建议、决定与执行责任](/images/articles/agent-trace-decision-owner.svg)

<!-- more -->

## Proposal 不是 Decision

模型输出 `tool=rerun_job` 是 proposal，表示它根据上下文建议调用。Proposal 保存 model snapshot、Prompt Bundle、context artifact hash、候选工具、arguments、理由与 finish state。

Validator 可能因 schema、对象歧义或权限拒绝 proposal；用户也可能不确认。把所有 proposal 都写成“Agent 执行了工具”，会夸大实际动作，并看不到系统挡住了多少错误。

自然语言答案中的建议也要标 actor=model。它可以说“建议把并发降到 4”，但如果平台 policy 固定要求并发不超过 8，两者是不同来源。UI 区分模型建议与系统规则，不让用户把模型措辞当正式策略。

Proposal ID 一路关联后续 decision。一次 proposal 经规范化后参数变化，产生新的 canonical proposal/version，不能把原始 arguments 悄悄替换。

## Policy Decision 有确定规则负责人

Policy engine 输入 subject、action、resource、state 和 context，输出 allow/deny/obligations、policy version、matched rule IDs 与 decision ID。actor 是 policy service/rule owner，不是模型。

“模型选择了它，所以允许”永远不是 policy reason。策略规则由安全/业务 owner 发布，有代码评审、版本、有效期和回归。决策能从 rule ID 找到当时内容。

policy timeout/unknown 也是结果。高风险动作 fail closed，不能让 orchestrator 自己决定“应该没问题”。如果使用 last-known-good policy，trace 标明快照与陈旧时间。

人工确认是 obligation 的履行，不覆盖权限。用户批准 plan hash 后，policy outcome 从 requires_approval 变为 executable；确认 actor、auth strength、time、expiry 与展示的 plan artifact 都保存。

## Orchestrator 负责流程选择

哪个模型 fallback、是否重试、选择哪个 Workflow 分支、何时停止，是 orchestrator decision。它可能基于固定规则、评分模型或用户配置，都要记录 policy/algorithm version 与候选。

例如 provider 429 后路由到备用模型：模型没有决定换供应商，工具也没有。route event 应显示候选因能力/地域过滤，最终因健康度和 deadline 选择了谁。

错误恢复同样有 owner。PERMISSION_DENIED 直接停止是规则；OBJECT_AMBIGUOUS 询问用户；RATE_LIMIT 退避。若将错误文本交给模型自由选择，actor 才是模型 proposal，仍需外层验证。

算法决策要保存关键输入，不必把内部完整推理文本存入。route score、threshold、features 和 version 足以复盘。无法解释的黑盒 scorer 至少能离线用同一输入重放。

## Tool Operation 记录真实副作用

通过授权后，executor 创建 operation。actor 是具体 service/credential，记录 tool version、canonical args hash、idempotency key、target version、下游 request ID 与状态历史。

operation accepted 不等于 succeeded，HTTP timeout 不等于 failed。最终业务验证再产生 verification event，例如新任务实例存在、配置版本已更新。模型最后说“已完成”不能替代这些证据。

人工直接在后台完成动作也要作为 external/manual operation 进入同一 Run，actor 是人员。否则 trace 看起来像 Agent 成功，实际是值班同学兜底。

补偿/回滚是新 operation，关联原 operation，不修改原结果。谁授权回滚、使用哪个旧版本都有独立记录。

## Decision Ledger 用事件而不是覆盖字段

当前状态可以是快照，决策历史必须追加。用户最初拒绝，后来换了计划再批准，两次事件都保留；旧模型 proposal 被 validator 修正，也不能只存最终参数。

事件包含 `decision_id`、`run/step`、`actor_type/id`、`decision_type`、`input_refs`、`output`、`rule/model/version`、`evidence_refs`、`event_time/observed_at`。敏感内容通过 artifact refs 和访问控制，不在公共日志铺开。

W3C/OpenTelemetry trace 用 span/event 表示技术链路，Decision Ledger 补充业务语义。Span 可以被采样，权限/审批/副作用决策进入不可丢失审计，两套用 trace/run ID 关联。

迟到事件不覆盖已生效决策。资源状态变化后重新授权生成新 decision version，执行器比较 expected version。事故调查能看到当时决策基于旧状态，而不是用今天状态解释昨天行为。

## 报表按责任层统计

模型 proposal invalid rate、policy deny、human reject、orchestrator fallback、tool failure、business verification failure 分开。所有失败合成 Agent success rate，团队会围绕模型调 Prompt，而真正问题可能在工具或策略。

人工接管也细分：纠正模型对象、批准高风险计划、修复工具失败、补充缺失知识。接管不是统一负面指标；正常审批本来就是设计，纠正错误才是质量信号。

评测断言 actor boundary：模型不能产生 allow 决策，policy 不能伪造用户确认，orchestrator 不能把 accepted 当 succeeded，finalizer 不能在 verification 缺失时成功。结构性断言比审核最终文字更可靠。

Agent 越自动化，越要避免一句“AI 做了决定”掩盖系统实际责任。模型提出候选，策略授权，人在必要时确认，编排器推进，工具产生效果。Trace 把这些角色和证据拆开，才能用于审计、优化和事故问责。

## 对照规范与资料

- [OpenTelemetry Trace：Span、Event、Link 与 Status](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [W3C Trace Context：跨服务传播关联身份](https://www.w3.org/TR/trace-context/)
- [NIST AI RMF 1.0：AI 风险的 Govern、Map、Measure、Manage](https://www.nist.gov/itl/ai-risk-management-framework)
- [MCP 2024-11-05 Specification：Host 的用户同意与控制责任](https://modelcontextprotocol.io/specification/2024-11-05)
