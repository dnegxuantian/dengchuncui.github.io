---
title: "Structured Output 仍然需要语义校验"
date: "2024-07-20 15:18:32"
updated: "2024-07-20 15:18:32"
categories:
- "模型工程"
tags:
- "Structured Output"
- "JSON Schema"
- "校验"
description: "模型返回合法 JSON，只能证明结构过关。日期范围、对象归属和字段组合仍可能违反业务规则。 结构化输出缩小了解析空间，没有消除业务判断。"
cover: /images/timeline/structured-output-semantic-validation.svg
top_img: /images/timeline/structured-output-semantic-validation.svg
permalink: /2024/07/20/structured-output-semantic-validation/
comments: false
---

<!-- generated: timeline-backfill -->

模型返回合法 JSON，只能证明结构过关。日期范围、对象归属和字段组合仍可能违反业务规则。

![Structured Output 仍然需要语义校验](/images/timeline/structured-output-semantic-validation.svg)

## 先看边界

Schema 负责类型、枚举和必填；跨字段约束由服务端校验器负责。

校验失败把精确错误反馈给模型重试，但限制轮次并保留每次候选。

## 落地时我会盯住什么

进入执行前把自然语言意图与最终结构并排审计，防止格式正确却偏离用户目标。

结构化输出缩小了解析空间，没有消除业务判断。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
