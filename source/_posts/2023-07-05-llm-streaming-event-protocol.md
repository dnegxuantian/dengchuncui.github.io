---
title: "大模型流式输出怎么接：不要把 TCP chunk 当成一条消息"
date: "2023-07-05 16:22:49"
updated: "2023-07-05 16:22:49"
categories:
- "AI Agent 工程化"
tags:
- "流式协议"
- "SSE"
- "模型网关"
description: "从 WHATWG SSE 格式和 2023 年 Chat Completions Function Calling 出发，说明字节分片、事件解析、增量归并、工具参数、终态和断流恢复的工程边界。"
cover: /images/articles/llm-streaming-event-protocol.svg
top_img: /images/articles/llm-streaming-event-protocol.svg
permalink: /2023/07/05/llm-streaming-event-protocol/
comments: false
editorial_standard: expert-v1
---

模型开启 `stream=true` 后，客户端能更早看到文字，接口看起来只是从一次 JSON 响应变成多次回调。实现里最常见的 bug，是每收到一个网络 chunk 就 `JSON.parse`，或者把每个 `data:` 行当成完整业务消息。

TCP/HTTP 传输分片、SSE 事件和模型增量是三层边界。它们恰好可能对齐，但协议从未保证对齐。我会先把字节流解析成完整 SSE event，再把供应商 event 归一化，最后由状态归并器构造答案。

![流式响应按事件归并，不按 TCP chunk 拼字符串](/images/articles/llm-streaming-event-protocol.svg)

<!-- more -->

## 网络 chunk 不是消息边界

一次 socket read 可能只拿到半个 UTF-8 字符、半行 JSON，也可能同时拿到三个 SSE events。代理、TLS record、缓冲策略和网络状况都会改变分片。下面这段逻辑在本机常常能跑，线上一定会遇到偶发解析失败：

```text
onChunk(bytes) -> decode -> split("data:") -> JSON.parse
```

正确做法先用增量 UTF-8 decoder 处理跨 chunk 字符，再维护行缓冲，按 SSE 空行识别 event。WHATWG 规范定义 `text/event-stream`，event 由字段行组成，连续多个 `data` 字段要用换行合并，`id` 和 `event` 也有独立语义。

解析器需要覆盖 CRLF、LF、注释心跳、空 data、多行 data 和末尾无完整事件。不能用 `readLine()` 后只取第一行 data。代理插入注释保活时，客户端应忽略而不是当模型空输出。

SSE parser 只负责协议框架，不应该认识 choices 或 function_call。这样同一解析器可以用固定规范样例测试，供应商 adapter 再处理 data payload。

## 模型 delta 必须进入状态归并器

每个供应商 event 可能只带 role、一个文本片段、函数名片段、arguments 片段或 finish reason。客户端不能假设每帧都有相同字段，也不能把缺失字段当空值覆盖已有状态。

归并器以 `choice/index` 或供应商等价标识维护状态：role 只设置一次，content 按顺序追加，function name 与 arguments 分别累积，finish reason 只能在终态写入。每个输入事件分配单调 seq，重复事件按 event ID 或 seq 去重。

工具 arguments 尤其不能边收边执行。一段 JSON 可能被拆成：

```text
{"job_id":"j
ob_12","date":"2023-
07-01"}
```

中途不仅无法解析，字符串内容也可能跨帧。等到 finish reason 表示 function call 完成后，再解析完整 JSON、做 schema/权限校验。UI 可以显示“正在准备工具参数”，不要把未闭合 JSON 直接展示给用户。

归并规则必须版本化。Function Calling 刚上线，供应商格式仍可能调整；未知 delta 字段保留到 native payload，并触发观测，不让默认反序列化悄悄丢掉。

## 流结束不等于回答完成

连接 EOF 有多种含义：正常收到终止标记后关闭、客户端主动取消、网关超时、上游断开、代理重置。只有看到协议约定的终态并通过完整性检查，才能标 completed。

我会维护以下终态：

```text
completed        正常 finish，文本或工具调用完整
truncated        模型达到长度限制
blocked          内容策略或供应商明确阻断
cancelled        调用方主动取消且已传播
incomplete       连接结束但没有可信终态
failed           协议或执行错误
```

HTTP 200 后断流属于 incomplete，不是 success。页面可以保留已收到文本并标“输出未完成”，持久化层不能把它当正常 assistant message 供下一轮上下文使用。否则下一轮模型会基于半句继续，错误会扩散。

finish reason 与最后一个文本 delta 也可能分开。归并器先接收终态事件，再统一 finalize；不要收到空 content 就提前结束，也不要等连接关闭才更新 UI。

## 取消和超时要传到上游

用户关掉页面只断开浏览器连接，如果网关仍读取供应商流，资源和费用会继续。客户端 disconnect 触发 cancellation token，网关关闭上游 body/连接，并记录 cancel_requested 与 provider_stream_closed 的时间差。

首字节超时、event idle timeout 和总 deadline 应分开。模型两秒没有首字节与生成中十秒无事件是不同问题；长回答可能持续正常输出，但仍需总时限。心跳注释是否重置 idle timeout，要在协议里明确。

自动重连并不总是安全。WHATWG EventSource 支持 `Last-Event-ID`，但模型 API 未必支持从特定 event 恢复。同一请求重新发起可能生成不同文本并重复计费。除非供应商明确支持 resumable stream，否则断流后标 incomplete，由用户重新请求或由上层创建新 attempt。

若产品需要“看起来继续”，也要把旧 attempt 与新 attempt 分开，不能把两个生成结果无痕拼接。新请求可携带已完成上下文，最终答案标明重试并重新验证。

## 背压从浏览器一直传到供应商

浏览器消费慢、WebSocket/SSE 下游堵塞时，网关不能无限缓存模型事件。每条流设置有界队列和最大累计字节；超过阈值可以暂停读取、丢弃仅用于 UI 的细粒度刷新，或取消请求，但不能悄悄丢模型内容。

对 UI 可合并相邻 text deltas，每 30 到 50ms 刷新一次，减少渲染频率；审计轨仍保存原始事件顺序或至少保存无损合并结果。工具、错误和终态事件不参与文本合并。

慢消费者指标要独立：provider first-token latency、provider inter-event gap、gateway queue time、client send time。只看端到端延迟，无法判断是模型慢还是前端渲染/网络回压。

多租户网关还要限制并发流和每连接缓冲。一个长时间不读的客户端不能拖垮事件循环或占满内存。清理路径覆盖正常终止、异常、取消和客户端消失，确保计数器与连接句柄最终释放。

## Raw Event 与最终文本都要保存

只保存最终拼接文本，遇到少字、重复、工具参数损坏时无法复现。我会保存 request metadata、原生事件序列或受控采样、归一化事件、归并器版本和最终结果 hash。

测试用例从真实故障形态来：一个 JSON 跨三个 TCP chunks、两个 SSE events 在一个 chunk、多字节中文被拆开、空 delta、函数参数逐字符到达、终态缺失、重复 event、客户端中途取消。对同一字节序列随机重新分片，解析结果必须完全相同。

还要断言不变量：seq 单调、终态最多一个、终态后不再接受内容、completed 时 JSON 参数可解析、最终文本等于所有有效 delta 有序拼接、raw 与 normalized 都能通过 request ID 找到。

流式协议的难点不在“边生成边展示”，而在面对任意分片、乱序风险和不完整结束时仍给出确定状态。把三层边界拆开并保留事件证据，才能让模型网关在高并发和故障场景下不丢字、不重复执行工具，也不把半个回答伪装成成功。

## 对照规范与官方资料

- [WHATWG Server-Sent Events：事件流格式、data/id 字段与 UTF-8 解析](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [OpenAI 2023-06-13 Function Calling：模型返回函数名与 JSON arguments](https://openai.com/index/function-calling-and-other-api-updates/)
- [RFC 9110：HTTP 状态与消息语义](https://www.rfc-editor.org/rfc/rfc9110)
- [Unicode Standard Annex #29：文本边界不能用任意字节切分推断](https://www.unicode.org/reports/tr29/)
