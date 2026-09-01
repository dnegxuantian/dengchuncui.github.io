---
title: "Function Calling 把工具接口推到台前"
date: "2023-06-14 16:12:56"
updated: "2023-06-14 16:12:56"
categories:
- "AI Agent"
tags:
- "Function Calling"
- "工具调用"
- "接口契约"
description: "Function Calling 让模型可以按 Schema 组织工具参数，但“格式正确”不等于“动作正确”。工具契约开始成为系统核心。 工具调用不是让模型直接碰系统，而是给它一条受约束、可审计的执行通道。"
cover: /images/timeline/function-calling-tool-contract.svg
top_img: /images/timeline/function-calling-tool-contract.svg
permalink: /2023/06/14/function-calling-tool-contract/
comments: false
---

<!-- generated: timeline-backfill -->

Function Calling 让模型可以按 Schema 组织工具参数，但“格式正确”不等于“动作正确”。工具契约开始成为系统核心。

![Function Calling 把工具接口推到台前](/images/timeline/function-calling-tool-contract.svg)

## 问题通常出在哪

- 参数 Schema 写清枚举、范围和必填条件，模糊字符串会把校验压力推给执行端。
- 模型负责提出调用，服务端仍要做身份、权限、幂等和业务校验。
- 每次调用保存原始意图、参数、工具版本和结果，才能重放与评测。

## 判断是否有效

工具调用不是让模型直接碰系统，而是给它一条受约束、可审计的执行通道。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
