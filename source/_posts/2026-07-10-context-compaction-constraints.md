---
title: "上下文压缩不能丢掉未决约束"
date: "2026-07-10 12:35:52"
updated: "2026-07-10 12:35:52"
categories:
- "AI Agent"
tags:
- "Context Compaction"
- "上下文"
- "长任务"
description: "长任务压缩历史时，最危险的不是少记一句对话，而是丢掉尚未满足的约束和失败尝试。 上下文压缩不是摘要写作，而是给运行状态做无损的工程化换页。"
cover: /images/timeline/context-compaction-constraints.svg
top_img: /images/timeline/context-compaction-constraints.svg
permalink: /2026/07/10/context-compaction-constraints/
comments: false
---

<!-- generated: timeline-backfill -->

长任务压缩历史时，最危险的不是少记一句对话，而是丢掉尚未满足的约束和失败尝试。

![上下文压缩不能丢掉未决约束](/images/timeline/context-compaction-constraints.svg)

## 架构判断

- 压缩产物分为目标、硬约束、已验证事实、未决问题、失败路径和证据指针。
- 工具原始结果不整段复制，保留内容地址与关键字段，必要时重新读取。
- 压缩前后运行约束检查，发现权限、日期或输出要求缺失就拒绝切换。

## 留给运维的答案

上下文压缩不是摘要写作，而是给运行状态做无损的工程化换页。

### 延伸资料

- [OpenAI: The next evolution of the Agents SDK](https://openai.com/index/the-next-evolution-of-the-agents-sdk/)
