---
title: "AI 生成 SQL 的护栏要分四层"
date: "2024-04-26 22:20:24"
updated: "2024-04-26 22:20:24"
categories:
- "AI 工程"
tags:
- "SQL 安全"
- "Guardrail"
- "数据平台"
description: "SQL 护栏只做关键词拦截很脆弱，注释、子查询和方言都能绕过。生产环境需要分层判断。 护栏的价值不是多拦，而是把不可接受的动作变成无法执行。"
cover: /images/timeline/ai-sql-four-guardrails.svg
top_img: /images/timeline/ai-sql-four-guardrails.svg
permalink: /2024/04/26/ai-sql-four-guardrails/
comments: false
---

<!-- generated: timeline-backfill -->

SQL 护栏只做关键词拦截很脆弱，注释、子查询和方言都能绕过。生产环境需要分层判断。

![AI 生成 SQL 的护栏要分四层](/images/timeline/ai-sql-four-guardrails.svg)

## 架构判断

语法层解析 AST，权限层校验表列，代价层限制扫描与并发，执行层只允许受控只读连接。

敏感字段在元数据检索阶段隐藏，不能等 SQL 生成后再发现。

## 留给运维的答案

每次拒绝返回明确层级和原因，让模型可以重新规划但不能降低规则。

护栏的价值不是多拦，而是把不可接受的动作变成无法执行。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
