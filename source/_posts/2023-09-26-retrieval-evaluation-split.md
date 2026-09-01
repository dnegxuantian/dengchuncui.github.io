---
title: "检索评测要拆开召回与生成"
date: "2023-09-26 21:51:21"
updated: "2023-09-26 21:51:21"
categories:
- "AI 工程"
tags:
- "RAG 评测"
- "召回"
- "生成"
description: "RAG 回答错了，如果不拆开检索和生成，很难判断该调 Embedding、切分、排序还是提示词。 把两段链路分开测，改动才知道作用在哪；一个总分无法指导工程优化。"
cover: /images/timeline/retrieval-evaluation-split.svg
top_img: /images/timeline/retrieval-evaluation-split.svg
permalink: /2023/09/26/retrieval-evaluation-split/
comments: false
---

<!-- generated: timeline-backfill -->

RAG 回答错了，如果不拆开检索和生成，很难判断该调 Embedding、切分、排序还是提示词。

![检索评测要拆开召回与生成](/images/timeline/retrieval-evaluation-split.svg)

## 把问题拆开

- 为每个问题标注最小证据集合，先评估证据是否进入 Top-K。
- 生成阶段固定检索结果，检查答案是否忠于证据以及引用是否指向正确片段。
- 无答案问题单独建集，系统应该承认缺证据，而不是从相似文档拼一个答案。

## 验收标准

把两段链路分开测，改动才知道作用在哪；一个总分无法指导工程优化。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
