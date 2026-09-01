---
title: "模型回答必须带证据层"
date: "2023-12-14 15:57:44"
updated: "2023-12-14 15:57:44"
categories:
- "AI 工程"
tags:
- "事实验证"
- "证据"
- "可追溯"
description: "企业系统不能把流畅回答直接当事实。模型输出上面需要一个证据层，说明数据来自哪里、何时有效。 降低幻觉最有效的办法不是让模型语气谨慎，而是让每个关键判断都能回到证据。"
cover: /images/timeline/model-answer-evidence-layer.svg
top_img: /images/timeline/model-answer-evidence-layer.svg
permalink: /2023/12/14/model-answer-evidence-layer/
comments: false
---

<!-- generated: timeline-backfill -->

企业系统不能把流畅回答直接当事实。模型输出上面需要一个证据层，说明数据来自哪里、何时有效。

![模型回答必须带证据层](/images/timeline/model-answer-evidence-layer.svg)

## 架构判断

结构化事实直接引用查询结果，解释性结论标注所依据的日志、配置或文档。

## 留给运维的答案

- 推断与已验证事实分开呈现，缺少证据时允许系统返回不确定。
- 用户纠正答案时记录错误类型和证据缺口，而不是只保存一条差评。

降低幻觉最有效的办法不是让模型语气谨慎，而是让每个关键判断都能回到证据。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
