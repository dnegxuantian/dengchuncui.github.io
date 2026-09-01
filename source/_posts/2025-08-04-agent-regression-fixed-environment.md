---
title: "Agent 回归为什么要固定工具与数据版本：不然只是重复提问"
date: "2025-08-04 18:57:37"
updated: "2025-08-04 18:57:37"
categories:
- "AI Agent 工程化"
tags:
- "Agent 回归"
- "测试环境"
- "Trace Replay"
description: "把 Agent 回归环境拆成行为、上下文、工具和运行时四个不可变 Bundle，固定模型、知识、权限、时间、工具状态与策略，再用单变量差异验证修复。"
cover: /images/articles/agent-regression-fixed-environment.svg
top_img: /images/articles/agent-regression-fixed-environment.svg
permalink: /2025/08/04/agent-regression-fixed-environment/
comments: false
editorial_standard: expert-v1
---

Agent 出错后，把同一句话再发一次，第二次答对并不能叫回归通过。模型 snapshot 可能升级，知识索引更新了，工具对象状态变了，用户权限和当前日期也不同。输入文字相同，实验条件已经不是同一套。

我把回归环境拆成四个不可变 Bundle：行为、上下文、工具、运行时。用例再声明权限身份与期望不变量。只有把这些版本固定，修改一个目标变量后的差异才有因果意义。

![Agent 回归的环境锁定清单](/images/articles/agent-regression-fixed-environment.svg)

<!-- more -->

## Behavior Bundle 固定生成条件

Behavior Bundle 包含 provider/model snapshot、system prompt/template、sampling、tool descriptions、output parser 和 safety settings。通用模型别名不能用于严格基准，因为供应商可能更新指向。

模型仍可能非确定，即使 temperature=0 也不能假设逐字一致。评测断言业务事实、工具路径、结构、权限和终态，关键样本重复运行看通过率。逐字 golden 只适合 deterministic formatter。

Prompt include、few-shot 和 schema 渲染后生成 canonical artifact/hash。只记录一个 prompt 文件名，依赖内容变化时历史报告会失效。

若旧 model snapshot 已下线，结果标 environment unavailable，不能用新模型冒充复现。可以继续验证 adapter/reducer fixture，在线行为只能叫 migration test。

## Context Bundle 固定模型看到的事实

RAG index/knowledge source versions、retrieval candidates、reranker、memory snapshot、conversation summary 与当前时间都属于 context。用户问“最近一周”，测试时钟变化后日期范围就不同。

严格组件回归直接固定最终 evidence chunks；检索回归固定 knowledge/index snapshot；端到端回归再同时跑真实 retrieval。三层不能混成一个分数。

权限影响上下文。用例保存合成 subject、roles/attributes 和 policy snapshot，期望无权 evidence 不进入候选。只固定知识不固定 ACL，可能因今天权限更宽而“召回提升”。

外部实时来源无法完全冻结时，保存 response fixture 或快照。必须访问 live web/API 的测试标 non-deterministic，结果与固定回归分开展示。

## Tool Bundle 固定契约与状态

工具不只是一份 input schema。还包括 tool version、adapter、output/error schema、后端 fixture、object state、idempotency 和 timeout/callback 序列。

真实失败经常是 timeout 但 operation 已成功、200 body 缺字段、回调乱序、资源 version 冲突。fixture 应保存这些原始形态，让编排器走同一失败路径，而不是所有 mock 永远立即 success。

有副作用工具在回归中默认 mock/dry-run。测试对象放专用 namespace，绝不使用生产 operation token。调用断言包括次数、顺序、canonical arguments、idempotency key 和最终验证，不只看模型是否说“完成”。

工具注册表 snapshot 固定。新增一个描述相似工具会改变选择，即使旧工具没改；所以测试要锁整份可见 tool set，而不是只锁被调用的那个。

## Runtime Bundle 固定系统决策

Router、policy、workflow/state machine、validator、adapter、budgets、clock、ID generator 和 retry/backoff 都影响轨迹。模型相同，路由权重变化也可能选另一个 provider；deadline 不同会让 fallback 有无机会执行。

测试使用虚拟 clock，approval expiry、tool timeout 和 backoff 不真等待。随机 ID/seed 通过依赖注入固定结构，避免 diff 被无意义 UUID 淹没。

Policy rules 和 resource state 同时固定。allow/deny 决策保存 matched rule IDs；修改 policy 时可以单独回放 proposal，确认预期权限变化。

运行环境还包括 tokenizer/SDK/runtime dependency。SDK 升级可能改变 request serialization 或事件解析，即使业务代码没改。lockfile/container digest 进入 manifest。

## 用例断言不变量与证据

期望包含：最终 state、必要/禁止 tool calls、operation count、对象 IDs、policy outcomes、claims/evidence、错误分类、最大 steps/cost。自然语言使用事实点和禁用结论，不要求完全相同。

每条断言指向风险。`no_duplicate_operation` 防超时重复副作用，`must_not_expose_column=phone` 防权限泄露，`incomplete_stream_not_success` 防协议误判。失败报告能直接定位哪条边界破了。

允许范围也明确。结果 latency 只在同硬件/网络或模拟层比较；token 可能因 tokenizer/model 版本改变，跨 Bundle 需要重算基线。没有可比条件就不下精确结论。

## 单变量实验后再做组合发布

修 Prompt 时固定工具、数据与模型，修 adapter 时用原始 response fixtures，换 embedding 时固定生成模型。先证明目标问题由这次修改解决，再跑完整新 Bundle 看交互效应。

报告展示 old/new manifests 与唯一差异。若一次提交同时换模型、Prompt、索引和工具，端到端提升也无法知道谁贡献；出现回归更无法快速回退。

离线通过后 shadow/canary 使用真实环境，记录 drift。固定测试保障历史错误不复发，线上灰度验证真实分布与外部系统变化，两者互补。

OpenAI Evals 等框架能组织样本与 grader，但环境锁定需要应用自己完成。Agent 是模型、上下文、工具和运行时的组合，不固定组合就没有可靠回归，只有一次新的演示。

## 对照框架与规范

- [OpenAI Evals：样本、评测与回归框架](https://github.com/openai/evals)
- [Git Objects：内容寻址与不可变对象](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [OpenTelemetry Trace：事件与 artifact 关联基础](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [JSON Schema 2020-12 Validation：结构化用例与工具契约](https://json-schema.org/draft/2020-12/json-schema-validation)
