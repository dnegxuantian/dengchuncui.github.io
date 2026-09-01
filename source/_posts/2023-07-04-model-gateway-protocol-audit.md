---
title: "模型网关别只做字段搬运：协议转换必须留下双轨审计"
date: "2023-07-04 09:36:12"
updated: "2023-07-04 09:36:12"
categories:
- "AI Agent 工程化"
tags:
- "模型网关"
- "协议适配"
- "可观测性"
description: "以 2023 年 Chat Completions 与 Function Calling 接入为背景，说明模型网关如何保留供应商原生证据、建立统一语义、管理能力矩阵并做协议回放。"
cover: /images/articles/model-gateway-protocol-audit.svg
top_img: /images/articles/model-gateway-protocol-audit.svg
permalink: /2023/07/04/model-gateway-protocol-audit/
comments: false
editorial_standard: expert-v1
---

模型网关第一版通常很像反向代理：统一鉴权，替换 endpoint，把 `messages` 转给不同供应商。真正接入多个模型后，会发现最难的不是请求字段，而是每家对流式增量、结束原因、工具调用、错误和用量的表达都不同。

如果网关只输出一套“看起来统一”的 JSON，却不保存转换前证据，线上出现空回答、工具参数残缺或 HTTP 200 后中途断流时，无法判断问题来自供应商、适配器还是客户端。我会同时保留原生协议轨和统一语义轨，两者用同一个 request ID 关联。

![模型网关的双轨协议审计](/images/articles/model-gateway-protocol-audit.svg)

<!-- more -->

## 先做能力矩阵，再做路由

不能假设所有 chat 模型都支持同一组参数。是否支持 system message、function calling、stream、最大上下文、JSON 输出、停止序列和固定版本，都要按 provider/model snapshot 记录。

客户端请求先解析为 capability requirements，例如 `needs_tools=true`、`stream=true`、`min_context=8k`。路由器只在满足要求的模型中选择；没有匹配项就明确失败，不把 tools 字段悄悄删除后当普通聊天发送。

矩阵来自真实探测和官方版本说明，不靠模型名推断。OpenAI 2023 年 6 月的发布说明只把函数调用能力明确给到 `gpt-4-0613`、`gpt-3.5-turbo-0613` 等版本，同时允许 pin model version。使用通用别名时，网关要记录最终实际模型；对关键业务我倾向固定 snapshot，评测通过后再升级。

参数转换也要暴露降级。例如供应商不支持某个 sampling 字段，网关可以按明确策略拒绝或忽略，但响应 metadata 必须列出 `dropped_parameters`。无声降级会让调用方以为配置生效，A/B 实验结论也会失真。

## 原生轨保存事实，统一轨服务业务

原生轨包含最终 URL 的 provider 标识、请求字段摘要、HTTP status/headers、响应 body 或流事件、provider request ID 与接收时间。秘密和敏感内容按字段策略脱敏，但结构、事件顺序和未知字段必须保留。

统一轨只表达业务真正需要的概念：assistant text delta、function call、usage、finish reason、provider error、gateway error。每个统一事件带 native event reference，出现转换争议时能回到原始片段。

不要为了统一而删除无法映射的信息。供应商新增 finish reason 或 event type 时，适配器输出 `unknown` 加 native value，监控告警；不能默认映射成 stop。未知意味着协议发生了变化，属于需要处理的信号。

原始内容的保存周期按数据敏感性控制。可以只保存加密 payload、结构化字段与 hash，在线排障通过授权临时解密。完全不存会失去审计，永久明文保存又扩大风险。policy version 也要记录，说明当时哪些字段被采集和脱敏。

## HTTP 成功和模型成功是两层状态

HTTP 200 只说明服务器接受并开始返回成功响应，不保证流完整，也不保证模型产生可用结果。非流式 body 可能缺 choices，流式连接可能在终态事件前中断，function arguments 可能不是完整 JSON。

我会把结果拆成：transport status、provider protocol status、model finish status、gateway normalization status。比如：

```text
HTTP=200
provider_stream=closed_without_finish
normalized_output=incomplete
client_status=retryable_unknown
```

这样告警不会把所有问题归成 5xx。RFC 9110 定义了 HTTP 状态语义，但应用协议仍需自行验证响应结构。对 429/5xx 的重试也不能只看状态码，还要结合方法幂等性、provider request ID、Retry-After 和调用是否已经产生计费/副作用。

错误响应要分 provider 与 gateway。鉴权缺失、路由无可用模型、schema 转换失败属于网关；配额、模型不存在、内容策略或上游超时属于供应商。统一 error code 之外保留 native code/message hash，排障和供应商对账才有依据。

## Finish Reason 是控制信号

finish reason 不只是统计字段。stop 表示正常结束，length 表示达到长度限制，function_call 表示等待应用执行工具，content filter 则可能没有完整文本。网关若统一成 `completed=true`，上层会把截断答案展示为最终结果，或忽略待执行的函数。

统一协议定义有限状态：`completed`、`requires_action`、`truncated`、`blocked`、`failed`、`incomplete`。每个 provider adapter 对 finish reason 做显式映射，映射表带版本并覆盖测试。新增原生值必须让测试失败，而不是落入默认分支。

工具参数在流中可能分段到达，只有终态确认后才解析完整 JSON。中间 delta 可以给 UI 展示，但不能提前触发工具。非流式同样要检查 function name 在请求允许列表、arguments 符合 schema，再交给工具执行层。

usage 也不能强行同义。有的供应商返回 prompt/completion tokens，有的只在末尾返回，有的暂时缺失。统一字段允许 null，附计量来源和单位。拿字符数估算可以作为 `estimated_usage`，不能覆盖 provider reported usage。

## 转换规则要能离线回放

每个适配器准备一组 raw fixtures：正常文本、空 delta、unicode、多 choice、function call 分片、length、拒绝、429、5xx、中途断流和未知字段。测试把固定原生输入转换为统一事件，断言事件序列和最终状态。

线上遇到新响应时，去敏后加入回归集。修复转换器后对历史 raw events 重放，确认只改变目标案例。若只有最终统一结果，没有原始事件，就无法验证修复是否真的覆盖生产形态。

请求侧也做 golden tests。同一 unified request 在不同 adapter 下生成预期 native body，明确默认值和删除字段。升级 SDK 前跑 diff，避免 SDK 自动改字段名或序列化 null，网关代码看似没变，线上请求却变了。

协议版本独立于网关服务版本。响应携带 `gateway_protocol_version` 和 `adapter_version`，客户端可以按版本兼容。大规模字段迁移先双写旧/新格式，观察消费者，再下线旧版本。

## 端到端 Trace 不能在流里断掉

网关生成全局 request ID，并把能传递的 trace header 送到供应商；拿到 provider request ID 后关联保存。客户端断开、网关取消、上游实际停止是三个事件，各自记录时间。

排障至少能串起：调用方、路由决策、模型 snapshot、请求变换、首字节时间、原生事件、统一事件、结束原因、usage 与最终持久化结果。只打“request success, latency=2s”无法解释用户为何看到半句话。

模型网关的价值不是隐藏所有差异，而是把差异变成受控、可观测的适配。统一协议让业务少写供应商分支，原生证据让平台在出错时不失明。两条轨道同时存在，才能安全演进模型与 API。

## 对照规范与官方资料

- [OpenAI 2023-06-13 API 更新：Function Calling、模型版本 pin 与升级说明](https://openai.com/index/function-calling-and-other-api-updates/)
- [RFC 9110：HTTP Semantics 与状态码定义](https://www.rfc-editor.org/rfc/rfc9110)
- [WHATWG Server-Sent Events：`text/event-stream` 与事件解析格式](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [JSON Schema 2020-12 Core：实例与 schema 的协议基础](https://json-schema.org/draft/2020-12/json-schema-core)
