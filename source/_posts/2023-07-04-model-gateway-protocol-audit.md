---
title: "模型网关先解决协议与审计"
date: "2023-07-04 19:07:41"
updated: "2023-07-04 19:07:41"
categories:
- "模型工程"
tags:
- "模型网关"
- "协议适配"
- "审计"
description: "模型供应商快速增加时，业务侧不该同时承担鉴权、重试、流式解析和版本差异。模型网关要先把这些基础问题收住。 模型网关的第一阶段不是智能路由，而是让每次调用都能被解释和追踪。"
cover: /images/timeline/model-gateway-protocol-audit.svg
top_img: /images/timeline/model-gateway-protocol-audit.svg
permalink: /2023/07/04/model-gateway-protocol-audit/
comments: false
---

<!-- generated: timeline-backfill -->

模型供应商快速增加时，业务侧不该同时承担鉴权、重试、流式解析和版本差异。模型网关要先把这些基础问题收住。

![模型网关先解决协议与审计](/images/timeline/model-gateway-protocol-audit.svg)

## 我会先看三组证据

统一内部请求模型，但保留供应商原始字段，避免最小公分母协议丢失能力。

## 取舍

- 请求 ID 贯穿调用方、网关和供应商，错误码区分客户端、限流、模型与转换失败。
- 审计记录提示词版本、模型版本、用量和延迟，敏感正文按策略脱敏或不落盘。

模型网关的第一阶段不是智能路由，而是让每次调用都能被解释和追踪。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
