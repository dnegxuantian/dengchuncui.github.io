---
title: "向量检索不是知识库本身"
date: "2023-01-20 21:18:54"
updated: "2023-01-20 21:18:54"
categories:
- "AI 工程"
tags:
- "向量检索"
- "RAG"
- "知识库"
description: "向量数据库解决的是相似片段召回，不负责文档是否过期、权限是否正确，也不负责答案能否追溯。 知识库的核心仍是内容治理；向量检索只是其中一个访问路径。"
cover: /images/timeline/vector-search-is-not-knowledge-base.svg
top_img: /images/timeline/vector-search-is-not-knowledge-base.svg
permalink: /2023/01/20/vector-search-is-not-knowledge-base/
comments: false
---

<!-- generated: timeline-backfill -->

向量数据库解决的是相似片段召回，不负责文档是否过期、权限是否正确，也不负责答案能否追溯。

![向量检索不是知识库本身](/images/timeline/vector-search-is-not-knowledge-base.svg)

## 别急着换组件

- 文档版本、来源、权限和生效时间作为一等元数据进入索引。
- Embedding 更新要能重建且可切换版本，不能在同一索引里无标记混用。
- 召回结果保留原文定位和分数，生成答案必须能回到具体片段。

## 实施顺序

知识库的核心仍是内容治理；向量检索只是其中一个访问路径。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
