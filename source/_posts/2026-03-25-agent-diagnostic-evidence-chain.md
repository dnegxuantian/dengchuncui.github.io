---
title: "Agent 诊断怎样建立证据链：从用户结果反查到模型、工具与持久化"
date: "2026-03-25 12:34:24"
updated: "2026-03-25 12:34:24"
categories:
- "AI Agent 工程化"
tags:
- "证据链"
- "Agent 可观测性"
- "故障诊断"
description: "建立跨模型、检索、工具、流式协议与持久化的 Agent 诊断证据链，用稳定关联 ID、原始事件和结果核验区分事实与推断。"
cover: /images/articles/agent-diagnostic-evidence-chain.svg
top_img: /images/articles/agent-diagnostic-evidence-chain.svg
permalink: /2026/03/25/agent-diagnostic-evidence-chain/
comments: false
editorial_standard: expert-v1
---

“模型没有返回结果”是一句症状，不是根因。我见过模型已经正常结束，网关漏了 terminal event；也见过前端展示了答案，服务端却没有持久化。只看其中一层，谁都能拿出一段日志证明自己没问题。

Agent 诊断需要的是可连接、可校验的证据链。它从用户实际看见的结果出发，关联到 Run、上下文、模型 Attempt、工具 Operation、流事件和最终存储，并明确哪一段是原始事实、哪一段是系统推断。

![Agent 诊断证据链](/images/articles/agent-diagnostic-evidence-chain.svg)

<!-- more -->

## 先定义要证明的命题

排查前先把问题写成可验证命题，例如：“Run R 在 12:31 调用模型 M，模型完整返回文本 X；网关转换时丢失 message_stop，所以客户端未收到终态。”这句话包含主体、时间、阶段、结果和因果候选，随后逐项找证据。

如果只说“可能是 SSE 有问题”，团队会各自搜索异常日志。诊断至少需要四个对照：provider 原始响应是否完整，转换后的事件是否完整，持久化结果是否完整，客户端收到并组装的内容是否完整。四处结果一致才可以排除协议链。

我会给每个结论标 evidence level：直接观测、关联推断、未验证假设。HTTP 状态、原始事件序列、数据库记录属于直接观测；“大概是网络抖动”没有链路数据，只能算假设。复盘里不能把后者写成已确认根因。

时间窗口也要固定。日志滚动、配置热更新、索引变化会让晚一点的查询得到另一套现场。先保存相关版本、原始片段和查询条件，再开始解释。

## 关联标识要贯穿所有边界

最外层有 tenant/session/request/run，工作流内部有 step/attempt，外部副作用有 operation，权限有 decision，模型供应商还有 provider request id。它们不必合成一个巨长 ID，但要能通过结构化字段双向关联。

Trace span 很适合表达时序和父子关系，但不能承载所有业务事实。模型完整响应、工具参数和产物可能过大或敏感，放受控存储，span 记录引用、hash、大小和 redaction status。采样也不能让高风险失败恰好消失。

跨异步队列时传播 trace context，同时把 run/step/operation 写进消息体。只靠线程上下文，消息重试或延迟消费后就断链。第三方系统无法接受 trace header 时，在幂等键或 metadata 中传递稳定业务关联键。

关联本身要校验。相同 request id 被连接池误复用、客户端自报的 trace id 未经验证、日志把旧 MDC 带到新任务，都会制造假链。ID 的生成方、作用域、唯一性和信任边界要明确。

## 原始证据与规范化事件同时保留

模型网关会把不同供应商协议转换成统一事件。规范化方便分析，但转换器本身可能是故障点。我会在合规允许范围内保存原始响应摘要或加密引用，并保存 adapter version。仅保留转换后的 JSON，无法证明字段是上游缺失还是本地丢失。

工具调用同理。Agent 生成的原始 arguments、schema 校验后的参数、对象解析后的 resource ID、实际发往下游的请求和下游业务结果分别留痕。它们之间的差异正是诊断证据，不能只保存最终一份。

检索证据包括 query、filter、index/source version、候选、rerank score 和实际注入 chunks。答案没引用某文档，可能是没召回、被权限过滤、被 rerank 丢弃、超过预算，或注入后模型未采用。没有各阶段集合就只能猜。

持久化记录保存写入版本和事务结果。前端收到的最后一个字符并不能证明对话库已提交；反过来数据库有完整答案，也不能证明客户端接收。两者用内容 hash、event range 和 terminal state 对照。

## 用不变量比搜 ERROR 更可靠

很多失败没有 ERROR。SSE 正常关闭却缺终态，工具返回 200 但业务状态 unknown，Run 标 succeeded 而必需产物为空。诊断平台应持续检查跨层不变量。

典型不变量包括：每个终止 Run 恰有一个 terminal outcome；已开始的 Attempt 最终 completed/failed/cancelled/unknown；tool call 有匹配 result 或明确未决状态；有副作用的 Operation 有 idempotency key 和 decision；最终输出 hash 与持久化版本一致。

流式协议还要验证序号单调、arguments delta 可组装为合法 JSON、内容结束先于整体终态、终态后无增量。连接关闭不是业务事件，不能用 EOF 猜成功。

不变量失败直接产生诊断事件，带相关 IDs 和最小证据，不等用户投诉才查。规则版本也要记录，避免今天的新检查去误判半年前的旧协议。

## 根因要经过对照和修复验证

先复现相同输入、Bundle 与版本；如果问题受外部数据影响，保存可替代的 fixture。然后只改变一个因素：绕过网关直连 provider、关闭流式改非流式、固定工具返回、切换 adapter version。对照结果决定故障在哪一段。

相关性不等于因果。某次发布后错误上升只是线索；需要对比新旧版本处理同一原始事件，或在 canary 回退后验证指标恢复。随手重启使问题消失，最多证明状态变化影响了症状。

修复后跑原失败样本、邻近边界样本和正常基线。协议问题验证完整事件序列，工具问题核对真实业务状态，检索问题核对候选与引用。只看页面能打开，不叫回归。

证据链还应支持“无法归因”。如果 provider 没给 request id、原始响应也未留存，就明确证据缺口，并补可观测能力。编一个听起来合理的网络原因，对下一次事故没有帮助。

Agent 系统的复杂性来自多个非确定组件串联。诊断并不是把日志堆进搜索引擎，而是让一次用户结果能沿稳定关系回到每个决定和事实。链条接上以后，团队争论会少很多，修复也能真正闭环。流式链路可以用 [SSE 事件不变量](/2026/06/25/sse-event-invariants/)做协议级检查，修复结果再进入[固定环境的 Agent 回归](/2025/08/04/agent-regression-fixed-environment/)。

## 对照资料

- [W3C Trace Context：跨系统传播 trace 标识](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry Trace Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/general/trace/)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Google SRE Book：有效故障排查方法](https://sre.google/sre-book/effective-troubleshooting/)
