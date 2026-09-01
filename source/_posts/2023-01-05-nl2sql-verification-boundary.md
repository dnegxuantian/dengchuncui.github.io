---
title: "自然语言生成 SQL 必须保留可验证边界"
date: "2023-01-05 10:18:25"
updated: "2023-01-05 10:18:25"
categories:
- "AI 工程"
tags:
- "NL2SQL"
- "SQL"
- "数据安全"
description: "让模型生成 SQL 很容易做出演示，难的是证明它查对了表、用了正确口径，而且不会越权。 NL2SQL 的产品价值来自缩短查询路径，可信度仍要由数据平台提供。"
cover: /images/timeline/nl2sql-verification-boundary.svg
top_img: /images/timeline/nl2sql-verification-boundary.svg
permalink: /2023/01/05/nl2sql-verification-boundary/
comments: false
---

<!-- generated: timeline-backfill -->

让模型生成 SQL 很容易做出演示，难的是证明它查对了表、用了正确口径，而且不会越权。

![自然语言生成 SQL 必须保留可验证边界](/images/timeline/nl2sql-verification-boundary.svg)

## 架构判断

模型只接收经过权限过滤的元数据视图，不能把全库 Schema 当提示词。

## 留给运维的答案

- 生成后先做语法、表字段、分区与代价检查，写操作默认拒绝。
- 结果页同时展示 SQL、数据版本和口径说明，让用户能复核而不是只看自然语言答案。

NL2SQL 的产品价值来自缩短查询路径，可信度仍要由数据平台提供。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
