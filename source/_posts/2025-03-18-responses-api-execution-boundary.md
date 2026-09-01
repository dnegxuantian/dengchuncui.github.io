---
title: "Responses API 之后更要隔离模型与执行"
date: "2025-03-18 16:29:14"
updated: "2025-03-18 16:29:14"
categories:
- "AI Agent"
tags:
- "Responses API"
- "Agent"
- "工具执行"
description: "模型接口开始内置更多工具能力后，应用层仍要明确哪些执行由供应商托管，哪些留在企业边界内。 API 越方便，边界越要写清；编排简化不能换来审计失真。"
cover: /images/timeline/responses-api-execution-boundary.svg
top_img: /images/timeline/responses-api-execution-boundary.svg
permalink: /2025/03/18/responses-api-execution-boundary/
comments: false
---

<!-- generated: timeline-backfill -->

模型接口开始内置更多工具能力后，应用层仍要明确哪些执行由供应商托管，哪些留在企业边界内。

![Responses API 之后更要隔离模型与执行](/images/timeline/responses-api-execution-boundary.svg)

## 别急着换组件

内置工具适合标准能力，企业数据和动作通过自有工具服务承接。

## 实施顺序

- 运行记录统一映射为内部事件模型，避免业务逻辑依赖某个供应商的事件名称。
- 切换模型前用固定轨迹验证文本、工具调用和结束状态，而不只是比较最终回答。

API 越方便，边界越要写清；编排简化不能换来审计失真。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
