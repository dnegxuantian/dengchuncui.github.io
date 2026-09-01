---
title: "Agent 成本为什么要算失败路径：断流、循环和重复工具都在花钱"
date: "2025-11-15 22:49:43"
updated: "2025-11-15 22:49:43"
categories:
- "AI Agent 工程化"
tags:
- "Agent 成本"
- "失败路径"
- "FinOps"
description: "建立 run-step-attempt-operation 成本账本，把失败模型调用、重复上下文、检索、工具、沙箱、等待和人工接管归因到具体失败路径，并用证据优化浪费。"
cover: /images/articles/agent-cost-failure-path.svg
top_img: /images/articles/agent-cost-failure-path.svg
permalink: /2025/11/15/agent-cost-failure-path/
comments: false
editorial_standard: expert-v1
---

Agent 成本报表如果只统计成功回答的 token，很容易得出错误结论。一次最终成功的 Run，前面可能有两次断流、三次无效工具参数、一次重复浏览器操作和人工接管。用户只看到一个结果，平台已经为失败路径付了多份成本。

我会按 `run -> step -> attempt/operation` 建成本账本，每笔费用关联 outcome 与 failure category。不是为了给失败“罚款”，而是找到哪些协议、上下文、工具和循环在持续制造浪费。

![Agent 失败路径成本树](/images/articles/agent-cost-failure-path.svg)

<!-- more -->

## 模型账单要包含所有 Attempts

每次模型调用记录 input/output/reasoning/cache tokens、provider/model snapshot、price version、finish、latency 和 run/step/attempt。断流无最终 usage 时估算并标记，不从报表删除。

重试复制大上下文会让同一 token 反复计费。账本区分首次输入、cache hit、retry duplicated context 和新增信息。这样能看出失败重试贵在模型输出，还是每次重新发送 100k 上下文。

fallback 累加主/备模型费用。最后由便宜模型成功，不代表整个路径便宜；最后由贵模型成功，也不代表便宜模型没有成本。

格式修复、summary/compaction、judge/evaluator 都是模型 attempts，不能藏在“平台成本”。按 role 分类，才能判断 evaluator-optimizer 循环是否值得。

## 检索和工具成本同样进入 Run

embedding、vector query、rerank、web/file search、MCP calls、数据库查询、浏览器/沙箱、代码执行和对象存储都可能按调用或资源计费。每项记录 unit、quantity、price snapshot 与 result。

工具失败也有成本。浏览器打开页面后被注入阻断，安全上是成功拦截，资源上仍花了浏览器时长；数据库计划检查拒绝大查询，成本小但不是零。安全拦截和无效浪费分开标签。

异步工具在 Agent 超时后可能继续运行。operation cost 仍回填原 Run，不能因为前端已结束变 orphan。取消延迟与后台残留资源单列。

共享资源按可解释规则分摊：沙箱容器时长、队列、trace storage、缓存。精确计量不到时标 allocated/shared estimate，不伪装成实际 usage。

## 人工与事故成本是质量信号

正常审批是流程成本，不等于失败；因模型对象选错、工具状态不明、答案无证据而人工纠正，是 failure recovery cost。两者在 ledger 用 reason 区分。

人工时间可以用标准分钟成本或实际工时，重点看趋势，不制造假精确。一次高风险错误引发事故调查、数据回滚和沟通，单独关联 incident cost，不能被百万次便宜问答平均掉。

用户重复提问也是潜在失败信号。前一次回答不完整导致用户重试，若 session/feedback 能关联，可估算 rework cost；但不能没有证据就把所有相似问题都算失败。

人工接管后任务完成，同时记录 automated outcome 与 final outcome。成本优化不能通过把更多困难任务静默推给人来实现。

## Failure Waste 需要可计算定义

我把 waste 定义为没有贡献到最终验证结果、且可通过工程改进避免的成本。失败 attempt 不一定全是 waste：一次必要的反例搜索虽没进入报告，也提高了结论可信度。

可识别模式包括：相同 context/tool arguments 重复；无新 evidence 的 Agent 循环；终态缺失导致全量重跑；已成功 operation 被再次调用；schema invalid 的多轮自修复；被裁剪掉的大量重复 chunks；deadline 后仍运行的资源。

每种模式有 detector 与 evidence。`no_progress_steps>=3`、相同 argument hash、operation idempotency hit、context duplicate ratio、closed_without_finish，都能从 trace 计算。不要让模型自己判断“这次浪费了”。

Waste ratio 按任务桶和版本展示，辅助定位。高风险安全检查即使最终拒绝，也不应被视为浪费；成本治理不能激励绕过 guardrails。

## 优化从最大的失败桶开始

若成本主要来自断流重跑，修 SSE/终态和 resumability；来自 invalid tool args，改善 schema/semantic validator 与有限修复；来自大上下文重复，做 artifact cache/compaction；来自循环，增加 progress/stop rules；来自人工纠错，修对象解析或 evidence。

降低 max steps 会立刻省钱，也可能降低复杂任务成功率。每个优化同时看 verified success、risk gates、latency 与 cost，做同期 A/B/canary。

缓存命中要验证语义。复用错误工具结果虽然省钱，却扩大事故；cache key 绑定 Bundle、input、permission、source/tool version 和 policy。数据新鲜度要求高的任务不盲目缓存。

路由层使用 Cost per Verified Success，平台层再看 failure waste composition。前者选模型，后者决定该修协议、上下文、工具还是流程。

## 预算要在运行时可执行

Run 有总 token/tool/time/cost budget，分配到 steps/workers。每次新 attempt 前估算剩余，无法在 deadline/预算内完成就降级或明确停止，不先花完再告警。

高价值研究可以允许更多搜索，简单查询限制步骤。预算是 task/risk policy，不由模型说“还需要再研究一下”自动扩大。人工批准额外预算生成新 decision。

实时预算使用估算，最终用 provider/tool usage 对账。估算偏差按模型/工具校准；价格更新版本化，历史账单保持当时价格，模拟可用统一价格重算。

告警不仅看金额。attempts per success、duplicate operations、orphan compute、human correction 和 unknown outcome 上升，常比账单总额更早暴露问题。

Agent 成本治理真正要优化的是可靠完成任务的路径。把失败 attempt、工具和人工都串回 Run，团队才知道钱花在哪个失败机制上，也不会用削弱验证和权限来换一张更好看的 token 报表。

## 对照资料

- [FrugalGPT：LLM cascade 的质量与成本优化](https://arxiv.org/abs/2305.05176)
- [OpenTelemetry Trace：Span、Event、Status 与资源属性](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [Google SRE Workbook：用用户结果定义 SLI/SLO](https://sre.google/workbook/implementing-slos/)
- [OpenAI 2025 Responses API：模型与内置工具的统一执行 primitive](https://openai.com/index/new-tools-for-building-agents/)
