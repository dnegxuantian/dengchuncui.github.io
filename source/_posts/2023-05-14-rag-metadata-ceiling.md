---
title: "RAG 元数据决定企业检索上限"
date: "2023-05-14 09:19:59"
updated: "2023-05-14 09:19:59"
categories:
- "AI 工程"
tags:
- "RAG"
- "元数据"
- "企业知识"
description: "企业 RAG 的效果上限往往不在模型，而在文档缺少负责人、生效时间、产品版本和权限标签。 没有治理元数据的 RAG，只是把共享目录里的混乱搬进了向量库。"
cover: /images/timeline/rag-metadata-ceiling.svg
top_img: /images/timeline/rag-metadata-ceiling.svg
permalink: /2023/05/14/rag-metadata-ceiling/
comments: false
---

<!-- generated: timeline-backfill -->

企业 RAG 的效果上限往往不在模型，而在文档缺少负责人、生效时间、产品版本和权限标签。

![RAG 元数据决定企业检索上限](/images/timeline/rag-metadata-ceiling.svg)

## 把问题拆开

> 索引字段至少包含来源系统、对象 ID、版本、更新时间、权限域和文档类型。

- 检索先做硬过滤，再做向量与关键词混合排序，权限不能交给相似度决定。
- 内容失效时按对象 ID 精确撤回，避免全量重建期间旧知识继续被召回。

## 验收标准

没有治理元数据的 RAG，只是把共享目录里的混乱搬进了向量库。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
