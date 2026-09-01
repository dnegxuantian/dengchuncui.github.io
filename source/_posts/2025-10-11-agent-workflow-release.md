---
title: "Agent Workflow 需要像代码一样发布：版本、迁移和回滚缺一不可"
date: "2025-10-11 15:28:00"
updated: "2025-10-11 15:28:00"
categories:
- "AI Agent 工程化"
tags:
- "Agent Workflow"
- "发布治理"
- "版本迁移"
description: "把 Agent Workflow 的节点图、状态、schema、Prompt、工具、策略与迁移打包成不可变 Definition，通过静态检查、契约回归、灰度、alias 和显式实例迁移发布。"
cover: /images/articles/agent-workflow-release.svg
top_img: /images/articles/agent-workflow-release.svg
permalink: /2025/10/11/agent-workflow-release/
comments: false
editorial_standard: expert-v1
---

Agent Workflow 一旦承载长任务、人工确认和真实工具，它就不再是一张可以随手改的流程图。运行中的实例可能停在旧节点，等待一个旧 schema 的工具结果；这时删节点、换工具或调整状态含义，会让恢复逻辑无法解释历史。

我会像发布代码一样发布 Workflow：源码构建成不可变 definition，锁定 Prompt/模型/工具/策略依赖，通过静态检查和回归后灰度。新版本默认只接新 Run，旧实例继续原版本，确需迁移则使用显式 migration plan。

![Agent Workflow 的构建与发布链路](/images/articles/agent-workflow-release.svg)

<!-- more -->

## Definition 包含的不只是节点图

Workflow version 要固定 nodes、edges、state schema、input/output contracts、retry/timeout、compensation、completion invariants 和 migration metadata。每个模型节点引用确切 Bundle，每个工具节点引用 registry/tool version。

如果只给流程图版本，Prompt alias 或工具 schema 仍用 latest，运行行为会漂移。构建阶段解析所有依赖为 content hashes，生成完整 manifest：workflow、model route、prompts、tool registry、policy、validator、artifact schemas。

Definition 创建后不可原地编辑。`prod` alias 指向一个已验证 version，回滚是切 alias，不是在线改 JSON。历史 Run 永远能找到当时 definition 与依赖。

环境变量和 secret 只记录引用，不打包秘密。不同环境的 binding 独立版本，测试 Definition 不能因切到生产而自动获得更宽工具权限。

## 静态检查先挡结构错误

构建器检查不可达节点、无终态循环、缺失错误边、未绑定 schema、超时/重试冲突、无补偿的高风险动作和无法解析的依赖版本。

状态迁移必须覆盖每类结果：model completed/truncated/incomplete，tool accepted/running/succeeded/failed/unknown，approval approved/rejected/expired。未知结果默认进 error/quarantine，不落到 success 分支。

预算也做路径分析。循环无 max steps、并行 fan-out 无上限、节点 timeout 之和超过总 deadline 都应构建失败或告警。静态分析不能证明业务正确，却能防很多结构性事故。

权限声明沿图传播。某节点产出敏感 artifact，后续外部 tool 的 data policy 不允许，就在发布前发现；不等线上模型真的把数据发出去。

## Contract 与 Eval 覆盖失败路径

每条 edge 都有 fixture。工具 timeout 但 operation 已成功、审批在到达前过期、模型 function arguments 被截断、worker 重启、并行分支部分失败，都要跑状态与幂等断言。

能力评测检查任务结果，守门评测检查权限、重复副作用、错误终态和数据出域。新 Definition 必须在当前 hash 的数据集上通过，不能复用旧报告。

测试固定 virtual clock、tool fixtures、knowledge/index 和 policy snapshot。模型行为重复多次，断言状态/工具/证据而非逐字输出。端到端 sandbox 再验证真实集成。

Definition diff 自动生成影响：新增/删除节点、改变 schema、重试、工具风险、状态、迁移。评审者看到行为变化，不必从大 JSON 中自己找。

## 灰度只让新 Run 进入

canary 按 user/workspace hash 固定分流，新 Run 从入口选择 workflow version 并保持到结束。不能同一个 Run 前半段 v11、服务发布后后半段 v12。

比较 completion、validation、tool errors、human correction、steps、latency、cost 和高风险守门。长任务结果晚到，灰度窗口必须覆盖完整生命周期；只看启动后十分钟会漏掉失败终态。

发现退化切 alias 回 v11，立即阻止新 Run 使用 v12。已经启动的 v12 Run 按 incident policy 继续、暂停或迁移，不能简单回滚代码后任其使用缺失依赖。

工具/策略紧急安全禁用可覆盖所有版本。Definition 固定不代表无视当前 deny；执行前仍检查 current revocation/policy，trace 同时记录设计版本和实时安全决策。

## 运行中实例迁移必须显式

多数情况让旧 Run 跑完最安全。需要迁移通常因为安全修复、旧依赖下线或长等待超过兼容窗口。Migration 声明 source versions、eligible states、state transform、artifact mapping、tool operation handling 和 rollback。

只迁移稳定 checkpoint，不在 MODEL_RUNNING/TOOL_RUNNING 中间换定义。先对账外部 operation，冻结 lease，再转换 state。旧节点 `WAIT_APPROVAL_V1` 到新 `WAIT_APPROVAL_V2` 若 plan schema 变化，旧批准应失效并重新确认。

Migration 本身是 operation，有 dry-run、影响实例列表、批次、审计和结果。转换失败的实例留在旧 version/quarantine，不形成半迁移状态。

迁移后保留原 event log，新增 `migrated_from/to` 与 transform version。回放可以按旧 Definition 重建迁移前状态，再验证转换。

## 兼容窗口由依赖共同决定

旧 Workflow 能继续运行，前提是工具、Prompt artifacts、policy evaluator、schemas 和存储仍兼容。发布新工具时保留旧 version；删除字段前查未完成 Runs 与 Bundles 的使用图。

Artifact schema 使用 versioned reader。新 runtime 能读旧事件，不要求把历史数据库原地改写。无法兼容时提供离线 migration，并验证 hash/count。

模型 snapshot 下线是外部约束。预先为旧 Definition 配置经评测的 compatible fallback/migration，不在调用失败时随便换通用别名。切换模型属于行为变更，必须留事件。

每个依赖声明 support-until，平台能提前发现某批长 Run 会跨过窗口。等下线当天再处理，会逼出高风险紧急迁移。

## 发布证据与运行证据闭环

Release record 包含 source commit、definition/manifest hashes、tests/evals、approvals、canary metrics、alias change 与 rollback target。Run trace 引用 release ID。

线上失败回流到对应 workflow/node/edge 评测，而不是只改 Prompt。状态转换 bug、工具 contract drift、迁移错误都有独立 owner。

Workflow 像代码发布，不是为了增加流程，而是承认它已经决定生产系统如何行动。不可变版本、失败路径回归、灰度与实例迁移建好后，团队才能持续改 Agent，又不破坏正在运行的工作。

## 对照资料

- [Semantic Versioning 2.0.0：版本与兼容性约定](https://semver.org/spec/v2.0.0.html)
- [Git Objects：内容寻址的不可变构建产物](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [OpenTelemetry Trace：跨节点记录 Span、Event 与 Link](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [Anthropic Building effective agents：Workflow 与 Agent 的组合模式](https://www.anthropic.com/research/building-effective-agents)
