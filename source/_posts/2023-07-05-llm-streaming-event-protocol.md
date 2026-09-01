---
title: "流式输出要按事件协议处理"
date: "2023-07-05 13:43:07"
updated: "2023-07-05 13:43:07"
categories:
- "模型工程"
tags:
- "SSE"
- "流式输出"
- "协议"
description: "把流式响应当成不断追加的字符串，会在工具调用、错误恢复和结束事件出现时迅速失控。 HTTP 200 只代表连接建立，完整的结束事件才代表一次模型调用成功收口。"
cover: /images/timeline/llm-streaming-event-protocol.svg
top_img: /images/timeline/llm-streaming-event-protocol.svg
permalink: /2023/07/05/llm-streaming-event-protocol/
comments: false
---

<!-- generated: timeline-backfill -->

把流式响应当成不断追加的字符串，会在工具调用、错误恢复和结束事件出现时迅速失控。

![流式输出要按事件协议处理](/images/timeline/llm-streaming-event-protocol.svg)

## 架构判断

事件至少区分文本增量、工具参数增量、工具结果、错误和结束原因。

## 留给运维的答案

- 聚合层维护消息状态机，不能根据连接关闭猜测一次回答是否完整。
- 保存原始事件流与最终消息的关联，出现缺字或重复时才能定位在哪一层发生。

HTTP 200 只代表连接建立，完整的结束事件才代表一次模型调用成功收口。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
