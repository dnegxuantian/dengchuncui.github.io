---
title: "RAG 切分要服从问题而不是字符数"
date: "2023-03-27 15:16:28"
updated: "2023-03-27 15:16:28"
categories:
- "AI 工程"
tags:
- "RAG"
- "Chunking"
- "知识检索"
description: "固定每 500 字切一段实现简单，却会把 SQL、配置和故障上下文拆散。切分策略应由用户问题反推。 好的 Chunk 不是长度均匀，而是单独拿出来仍能支撑一个明确判断。"
cover: /images/timeline/rag-chunking-by-question.svg
top_img: /images/timeline/rag-chunking-by-question.svg
permalink: /2023/03/27/rag-chunking-by-question/
comments: false
---

<!-- generated: timeline-backfill -->

固定每 500 字切一段实现简单，却会把 SQL、配置和故障上下文拆散。切分策略应由用户问题反推。

![RAG 切分要服从问题而不是字符数](/images/timeline/rag-chunking-by-question.svg)

## 别急着换组件

> 技术文档按标题层级、代码块和表格边界切分，保留父标题作为上下文。

- 日志与运行记录按实例和时间窗口组织，不能混入无关任务的相邻文本。
- 评测召回时看证据是否完整，不只看答案关键词是否出现。

## 实施顺序

好的 Chunk 不是长度均匀，而是单独拿出来仍能支撑一个明确判断。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
