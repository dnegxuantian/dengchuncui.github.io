---
title: "LLM 应用怎么做可观测：不要把一次 HTTP 请求当成一次 Run"
date: "2024-01-04 10:24:36"
updated: "2024-01-04 10:24:36"
categories:
- "AI Agent 工程化"
tags:
- "LLM 可观测性"
- "Trace"
- "模型网关"
description: "把一次 LLM 运行拆成输入、检索、模型 attempt、工具调用和最终化证据，说明 trace 身份、事件时间、状态、成本与敏感数据如何统一观测。"
cover: /images/articles/llm-run-observability.svg
top_img: /images/articles/llm-run-observability.svg
permalink: /2024/01/04/llm-run-observability/
comments: false
editorial_standard: expert-v1
---

传统 API 监控里，一条 HTTP 请求通常对应一个服务操作。LLM 应用不一样：用户问一句话，内部可能先检索两次、调用主模型、执行工具、再调用模型总结；上游断流后还可能换模型重试。只记录入口 latency 和 status=200，看不出回答为何错，也算不清真实成本。

我把 `run` 定义成一次用户意图的完整处理，下面挂 retrieval、model attempt、tool call、policy decision 和 finalization。HTTP request 是承载方式之一，不是业务身份。所有事件通过 run_id 串起来，最终状态由证据归并得出。

![一次 LLM Run 的证据树](/images/articles/llm-run-observability.svg)

<!-- more -->

## Run、Attempt 和 Span 分工不同

Run 表示用户看到的一次操作。模型 429 后重试两次，仍属于一个 Run，但有三个 model attempts；工具查询和最终总结分别是 spans。把重试当新 Run，会夸大用户请求量，也丢失失败成本。

每个 Run 固定 user/session、tenant、input hash、Bundle version、deadline 与风险等级。Attempt 固定 provider、model snapshot、route reason、request ID、start/end 和 outcome。Span 记录一个具体阶段的父子关系与事件。

W3C Trace Context 定义了跨服务传播 `traceparent`/`tracestate` 的基础，OpenTelemetry Trace 也用 trace、span 与 events 表示分布式操作。LLM 平台可以沿用这套关联，但需增加业务 run_id：一个 Run 可能跨多个异步 trace，trace 采样也不能让业务审计身份消失。

调用外部模型或工具时传递可接受的 trace header；供应商不支持时，保存其 request ID 与本地 span ID 映射。日志里只有各自 UUID、没有关联表，等同于没有链路。

## 时间至少分发生与观测

流式事件在供应商生成、网关接收、客户端展示之间有延迟。工具执行结果也可能通过异步回调晚到。只保存一个 timestamp，无法分析慢在哪里，也无法处理乱序。

事件至少包含 `event_time`（源端声称发生）、`observed_at`（本系统收到）、`sequence`（同一来源顺序）和 monotonic duration。跨机器 wall clock 会漂移，单进程耗时优先使用单调时钟；跨服务只在时钟同步误差范围内解释。

首 token latency 从上游请求发送到首个有效模型 delta，不包括网关排队时可再拆 queue duration。最终 answer latency 从 Run 开始到可交付终态。客户端断开后上游仍运行时，provider latency 与 user-perceived latency 分开。

所有 duration 附起止事件，而不是直接打一个数。将来修复事件解析器后，可以从原始时间重新计算；只存聚合值无法回放。

## 状态要表达不完整与待动作

HTTP 200 不能直接写 success。一个模型 attempt 可能 completed、truncated、blocked、incomplete、cancelled 或 failed；工具调用可能 proposed、authorized、running、succeeded、business-verified；Run 还可能 requires_action 等用户确认。

最终化规则必须确定。例如文本正常结束但引用校验失败，model attempt 是 completed，Run 是 failed_validation；工具已成功但总结模型断流，operation 是 succeeded，Run 是 incomplete，重试时不能再执行工具。

状态转换记录 actor 与 evidence reference。人工把 Run 标成 resolved，不覆盖原失败事件，而是追加 resolution。这样“用户最终拿到答案”和“第一次执行成功”可以同时统计。

告警按层级分开：provider transport error、adapter protocol error、invalid model output、tool/policy error、answer validation failure。一个总 error rate 无法指向责任模块。

## 成本要覆盖失败路径

一次成功答案可能包含检索、重排、两个模型 attempt、embedding 与工具 API。成本账本按 span 记录 input/output tokens、供应商报告 usage、估算标志、单价版本和缓存命中。

失败 attempt 不能丢。主模型输出一半后断流，fallback 再完整生成，用户只见一次答案，平台支付两份 token。若报表只算最终成功 attempt，会让不稳定路由看起来又便宜又快。

token usage 允许缺失。流式中途断开时供应商可能没有最终 usage，平台可以按 tokenizer/字符估算，但字段标 `estimated=true`。估算不能覆盖原生值，也不能用于供应商账单对账。

成本与质量通过 Run 关联，才能看每个“验证成功答案”的价格。只看每千 token 单价，会忽略某个便宜模型反复重试、工具参数错误导致的额外成本。

## 内容观测要按风险分层

完整 Prompt、检索片段、工具参数和答案最利于复现，也可能包含个人信息、商业数据和凭据。不能因为要可观测就默认全部明文落日志。

schema 层标记敏感字段，写入前做结构化脱敏；正文可以保存加密 payload、hash 和保留期。普通值班人员看到事件结构、长度、错误和对象 ID，只有经过授权的调查才能解密内容。

采样也要分层。性能 metrics 可以全量，结构化事件尽量全量，正文 payload 按风险与错误采样。安全、权限与真实动作审计不能被普通 trace sampling 丢掉，另走不可变审计存储。

用户删除会话后，内容与派生 embedding 的删除范围要清楚；运营统计保留匿名聚合，不继续保存可还原原文的 hash/metadata 组合。

## 可复现依赖完整版本上下文

排查“昨天能答、今天答错”，至少要知道 model snapshot、Prompt Bundle、tool schemas、retrieval/index、policy 和 adapter 版本。只记录模型名没有意义，通用别名和知识库都可能变化。

我会从失败 Run 生成 replay manifest，引用去敏输入、固定检索证据、模拟工具结果和预期不变量。离线先重放 normalization/finalization；确需真实模型再发新 attempt，并明确它不是对历史现场的完全复现。

Dashboard 只是证据的入口。点开错误率，应能到 Run，再到具体 attempt/span、原生事件和验证结论。反过来，从一条供应商 request ID 也能找到用户 Run 与最终影响。

LLM 可观测的目标不是多打几条 Prompt 日志，而是把一次复杂运行拆成有身份、有版本、有状态的证据树。这样才能区分模型、检索、工具和协议问题，解释成本，也能在改完之后用同一份失败现场做回归。

## 对照规范与资料

- [W3C Trace Context：跨服务传播 trace 标识的标准](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry Trace：Span、Event、Link 与状态模型](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [OpenAI 2023 Function Calling：模型与工具交互的公开协议背景](https://openai.com/index/function-calling-and-other-api-updates/)
- [RFC 9110：HTTP 成功与错误状态的协议语义](https://www.rfc-editor.org/rfc/rfc9110)
