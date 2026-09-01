---
title: "多 Agent 协作先定义交接协议：任务、证据和所有权不能靠聊天转述"
date: "2025-11-04 09:46:51"
updated: "2025-11-04 09:46:51"
categories:
- "AI Agent 工程化"
tags:
- "Multi-Agent"
- "Handoff"
- "协作协议"
description: "为多 Agent 的 orchestrator-worker 模式定义 Handoff Manifest、执行 Lease、Artifact Store、Result Contract 与 Acceptance Gate，处理重复任务、失联重派和证据所有权。"
cover: /images/articles/multi-agent-handoff-contract.svg
top_img: /images/articles/multi-agent-handoff-contract.svg
permalink: /2025/11/04/multi-agent-handoff-contract/
comments: false
editorial_standard: expert-v1
---

多 Agent Demo 里，主 Agent 常给子 Agent 发一句“去查一下这个问题”，子 Agent 回一段文字，主 Agent 再综合。任务一复杂，就会出现范围重叠、工具权限过宽、结果无法验收、两个 worker 重复做同一副作用，最后也不知道谁还持有任务。

我把交接设计成协议，不是聊天。Orchestrator 创建 Handoff Manifest，worker 获取带期限的 lease，过程产物写共享 Artifact Store，返回结构化 Result Contract；Orchestrator 通过 Acceptance Gate 后才把子任务标完成。

![多 Agent 交接是一份有所有权的契约](/images/articles/multi-agent-handoff-contract.svg)

<!-- more -->

## Handoff Manifest 先把任务说完整

Manifest 包含 task ID、parent/run、objective、scope、input artifact refs、allowed tools/resources、subject/delegation、budget、deadline、priority、expected output schema 和 completion criteria。

Objective 要能验收。“研究 MCP”太宽，“比较 2024-11-05 规范中 resources 与 tools 的控制模型，返回条款链接和差异表”才有边界。

输入通过不可变 artifact refs 传递，不把主 Agent 全部对话复制给 worker。worker 只看到子任务需要的用户约束、证据和工具，减少噪声与权限面。

完成标准由 orchestrator/流程定义，不能让 worker 自己说“我认为完成”。例如必须覆盖三个 claims、每条至少一个官方来源、不得执行写工具、输出符合 schema。

## Lease 解决谁当前负责

worker 接单后获取 lease，记录 owner agent instance、attempt、acquired/heartbeat/expiry。同一 task 同时只有一个有效 lease，避免两个 worker 并发写同一 artifact 或调用同一工具。

心跳失联不立即重派。先检查 worker/external operations，确认没有正在执行副作用；只读/纯计算任务可在 lease expiry 后新 attempt，写操作使用 operation idempotency/status 对账。

worker 主动释放、完成或被取消都有事件。Orchestrator 重启后从 lease store 恢复，不靠对话中“某某正在处理”判断。

长工具 operation 与 worker lease 分开。worker 可以退出，operation 仍由工具系统运行；新 worker 接管时查询同一 operation，不重新执行。

## 共享的是 Artifact，不是隐式记忆

worker 输出检索结果、代码 diff、计划、测试报告等不可变 artifacts，带 type/schema/version/hash/provenance。共享 board 只保存引用和状态，不让多个 Agent 共同修改一段自由文本 memory。

Artifact owner 表示谁产生，不表示只有它能用；ACL 与 data classification 随 artifact 传播。子 Agent 不能把高敏感输入交给无 scope 的另一个 worker。

中间发现可发布为 partial artifact，但 status 标 incomplete，列 unresolved。其他任务依赖时明确允许 partial，不能看到文件存在就当完成。

冲突 artifacts 都保留。两个 worker 对同一 claim 给出不同证据，由 acceptance/merge policy 比较来源，不让最后写入者覆盖。

## Result Contract 返回状态与缺口

结果包括 status（completed/partial/failed/cancelled）、output artifact refs、evidence refs、decisions、tool operations、unresolved questions、warnings、cost/usage 和 suggested next actions。

错误使用稳定 category：input_missing、permission_denied、tool_failure、evidence_insufficient、deadline_exceeded。自然语言 message 只是解释，orchestrator 根据 code 与 policy 处理。

worker 不返回自己的秘密或可复用 credential。delegated capability 在 lease 结束失效；result 只包含 capability/decision IDs。

下一步建议仍是 proposal。worker 建议“重跑任务”不会自动变成主 Agent 动作，需新 Handoff 或工具授权。

## Acceptance Gate 保留最终责任

Orchestrator 检查 result schema、completion criteria、artifact hashes、evidence coverage、operation status 和 budget。验证通过才 accept；缺证据可创建 follow-up，格式错有限修复，越权立即失败。

聚合多个 worker 时按 task IDs 和 claims 对齐，去重同源证据，显示冲突。不是把所有文本串起来再让大模型“总结一下”。

Orchestrator 仍对最终结果负责。它选择如何拆分、把哪些 artifacts 交给谁、接受哪个结果；trace 记录这些 decision。worker 责任限定在 manifest scope。

人工审批也作为 gate，绑定聚合 plan hash。worker 数量增加不会稀释用户确认和 policy。

## 并行只用于独立子任务

拆分前画数据/状态依赖。两个 worker 需要修改同一文件、使用同一外部锁或后者依赖前者证据时，不应盲目并行。可以先并行调查，再串行合并/执行。

共享资源配额由 orchestrator 控制，全局并发、token、工具和外部 API rate limits 不能让每个 worker 各自认为有完整预算。

取消传播到 leases 和模型调用，外部 operation 按能力取消/对账。父 Run deadline 到期，不留下孤儿 worker 继续烧成本。

重复任务检测基于 normalized objective、scope 和 input hashes；相似不等于相同，涉及副作用时宁可显式合并，不自动 dedupe。

## Trace 要能还原交接链

父/子 tasks 用 OpenTelemetry Links/业务 parent IDs 关联，记录 manifest version、lease events、worker Bundle、tools、artifacts、result 与 acceptance decision。

指标按交接阶段：queue/lease wait、worker execution、acceptance/rework、重复 tasks、orphan leases、artifact conflict、cost per accepted subtask。只看最终 Run 成功率看不出协作开销。

真实失败转成 handoff 回归：输入缺关键约束、lease 超时重派、worker 工具已执行、两个结果冲突、partial 被误 accept、权限 scope 跨 worker 泄露。

Anthropic 的 orchestrator-workers 模式说明了动态拆分价值。生产多 Agent 的难点不在模型数量，而在任务与状态能否可靠交接。Manifest、lease、artifact 和 acceptance 建好后，协作才是可观测系统，不是多个聊天机器人互相转述。

## 对照资料

- [Anthropic Building effective agents：Orchestrator-Workers 与并行模式](https://www.anthropic.com/research/building-effective-agents)
- [OpenTelemetry Trace：Span Links 与跨工作单元关联](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [W3C PROV-O：Entity、Activity、Agent 与 provenance](https://www.w3.org/TR/prov-o/)
- [JSON Schema 2020-12 Validation：Handoff 与 Result 的结构契约](https://json-schema.org/draft/2020-12/json-schema-validation)
