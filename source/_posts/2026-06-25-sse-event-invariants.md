---
title: "SSE 完整性为什么要用事件不变量验证：HTTP 200 只能证明连接建立过"
date: "2026-06-25 21:38:55"
updated: "2026-06-25 21:38:55"
categories:
- "模型工程"
tags:
- "SSE"
- "流式协议"
- "事件不变量"
description: "为模型与 Agent 的 SSE 链路定义序号、组装、因果、终态和重连不变量，跨 provider、网关、持久化与客户端验证完整结果。"
cover: /images/articles/sse-event-invariants.svg
top_img: /images/articles/sse-event-invariants.svg
permalink: /2026/06/25/sse-event-invariants/
comments: false
editorial_standard: expert-v1
---

模型接口返回 HTTP 200，页面也开始逐字输出，很多监控就把请求记为成功。用户最后却只得到半句话，或工具参数少了一个括号。对流式链路来说，200 证明的只是响应头成功返回，不证明业务事件完整，更不证明最终结果已经保存。

我更倾向用事件不变量验收 SSE：对任意一次 Run，无论供应商协议、网关转换、代理缓冲和客户端重连怎样变化，都有一组顺序、唯一性、组装与终态条件必须成立。违反条件就明确标失败或未知，不能靠 EOF 猜成功。

![SSE 事件不变量检查链](/images/articles/sse-event-invariants.svg)

<!-- more -->

## 先分清传输帧和业务事件

SSE wire format 用 `event/data/id/retry` 字段与空行分隔事件，注释行可作 heartbeat。一条业务事件可能被 TCP、HTTP/2 或代理拆成任意字节块，客户端必须按 SSE 语法解析，不能假设一次 `read()` 就是一条完整 JSON。

反过来，一个模型内容块也可能跨多条 SSE event 增量传输。网关先解析传输帧，再根据 provider 语义组成规范事件，例如 response.started、content.delta、tool.arguments.delta、tool.completed、response.completed/failed。

我会保留三层计数：raw bytes/chunks、SSE events、normalized domain events。三者数量不同很正常，但每层有自己的 parser errors、last sequence 和 close reason。把所有东西都叫 chunk，出了问题无法定位是哪层切坏了。

代理缓冲会把多个 event 延迟送达，压缩和换行处理可能改变边界。上线前要真实经过 CDN、Ingress、服务网格和浏览器测试，而不是只用服务端单元测试证明 parser 正确。

## 顺序和唯一性必须可计算

每条规范事件带 run/response id 与单调 sequence，内容块再带 output/item/content indices。接收端检查 sequence 不回退、不无故跳号；允许重连重放时，同一 sequence 的 payload hash 必须一致，并按 event ID 去重。

并行工具调用会交错增量，不能仅按到达顺序拼一个全局字符串。arguments delta 按 tool call/item id 分桶，各自维护 JSON buffer；completed 前必须能解析且满足 schema。一个工具完成不能隐式关闭另一个工具。

文本、reasoning、citation、audio 与 tool call 都有独立生命周期。adapter 不认识的新 event type，应记录并按兼容策略处理，不能静默塞进文本。协议版本固定在 Run Bundle，避免升级后同一 raw stream 得到不同解释。

事件时间只用于观测，不用于排序。跨服务时钟会漂移，真正的顺序来自上游 sequence 与本地 append offset；没有上游序号，就由入口 adapter 在单连接内分配，并明确它不能代表 provider 内部顺序。

## 终态不变量决定成功还是未知

一次 Attempt 恰好有一个规范终态：completed、failed 或 cancelled；连接 EOF、socket reset、客户端 close 都不是业务终态。如果底层断开而未收到终态，Attempt 是 `closed_without_terminal`，Run 决定恢复、查询或失败。

completed 要满足所有已开始 content/tool blocks 已结束，所有必需工具结果已关联，usage/finish 可缺省但缺失有标记，最终可见输出与持久化产物 hash 一致。终态之后收到新的 delta 是协议错误，不继续拼接。

failed 保存 provider error、adapter error 或下游 error 的原始分类；cancelled 区分用户取消、deadline、budget 与上游取消。前端都显示“已停止”可以，诊断数据不能混成一个状态。

有些 provider 先结束模型响应，Agent 随后执行工具并发起下一次模型调用。这里 response terminal 不等于 Run terminal。层级状态机明确 Attempt、Step 和 Run 的终态，避免模型调用 completed 就提前把整个任务写成功。

## 重连要靠游标，不靠重复整次请求

SSE 的 `id`/Last-Event-ID 提供重连基础，但业务系统仍需持久 event log 与保留窗口。客户端确认最后应用的序号，重连后服务端从下一条投递；重复事件按 id 去重，断档则返回明确的 `cursor_expired`，再走结果快照恢复。

如果后端没有持久事件，自动重新调用模型不是“重连”，而是新 Attempt。它可能产生另一份回答和重复工具副作用。界面要显示重新生成，并使用新的 attempt/operation ids。

慢客户端会造成背压。服务端限制每连接 buffer，超过阈值可以断开让客户端按游标恢复；不能无限堆内存，也不能丢掉中间 tool delta 后继续发 terminal。heartbeat 只判断通道活性，不推进业务 cursor。

客户端刷新页面后先取 durable snapshot，再订阅 snapshot version 之后的事件，可以避免“查询结果和订阅之间”丢消息。这个模式和数据同步里的 snapshot + change log 很像，边界要由版本号衔接。

## 测试要故意在每个边界断开

我会构造字符级随机切片，确保中文多字节、`\n`、多行 data 和 JSON 字符串跨 chunk 仍可解析；再生成事件重复、乱序、缺号、未知类型、终态缺失和终态后增量，验证 checker 能拒绝。

链路故障测试在 provider->gateway、gateway->Ingress、Ingress->browser 各自断开；终态落库前后杀进程；让客户端带旧 cursor 重连；制造慢消费者。每种情况下都核对 Run 状态、事件历史、页面内容和是否重复调用工具。

线上指标至少有 closed_without_terminal、sequence_gap、duplicate_mismatch、invalid_tool_json、terminal_after_terminal、snapshot_hash_mismatch、reconnect_replay_count。总请求成功率会把这些关键问题平均掉。

排查时保留原始字节/事件的受控采样与 adapter version。只保存最终拼好的文本，会失去证明“上游完整、转换丢失”或“上游本来就断了”的证据。

流式体验给用户的是逐步反馈，工程上承担的却是一条分布式事件协议。只有把不变量写进解析器、存储和监控，系统才知道一段回答是真的完成，还是仅仅在 HTTP 200 之后停止了。

## 对照资料

- [WHATWG HTML：Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [W3C EventSource：Last-Event-ID 与重连模型](https://www.w3.org/TR/eventsource/)
- [OpenAI API：Streaming Responses](https://platform.openai.com/docs/guides/streaming-responses)
- [Anthropic API：Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming)
