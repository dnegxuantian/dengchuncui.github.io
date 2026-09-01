---
title: "SQL Copilot 必须经过真实引擎验证"
date: "2023-08-06 13:45:51"
updated: "2023-08-06 13:45:51"
categories:
- "AI 工程"
tags:
- "SQL Copilot"
- "EXPLAIN"
- "回归验证"
description: "模型能写出语法像样的 SQL，但方言、函数和表统计信息决定它是否真的能跑。验证不能停在文本层。 SQL Copilot 的可信度来自数据库和执行引擎，不来自模型表达得多肯定。"
cover: /images/timeline/sql-copilot-engine-validation.svg
top_img: /images/timeline/sql-copilot-engine-validation.svg
permalink: /2023/08/06/sql-copilot-engine-validation/
comments: false
---

<!-- generated: timeline-backfill -->

模型能写出语法像样的 SQL，但方言、函数和表统计信息决定它是否真的能跑。验证不能停在文本层。

![SQL Copilot 必须经过真实引擎验证](/images/timeline/sql-copilot-engine-validation.svg)

## 架构判断

先用解析器和 Catalog 校验字段，再对只读语句执行 EXPLAIN，禁止模型绕过分区和权限限制。

### 实施时

- 优化建议附带原计划与新计划差异，不能只说“减少扫描”却不给扫描量证据。
- 对关键 SQL 使用固定数据集回归，比较结果集合而不是只看执行成功。

## 留给运维的答案

SQL Copilot 的可信度来自数据库和执行引擎，不来自模型表达得多肯定。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
