---
title: "大模型进入数据平台先做只读助手"
date: "2023-02-13 11:45:52"
updated: "2023-02-13 11:45:52"
categories:
- "AI 工程"
tags:
- "大模型"
- "数据平台"
- "只读助手"
description: "在模型稳定性和工具生态都还不成熟时，数据平台最适合从解释、检索和诊断建议开始，而不是直接改任务。 先把回答做可信，再把动作做自动，是企业场景更稳的演进顺序。"
cover: /images/timeline/llm-readonly-data-assistant.svg
top_img: /images/timeline/llm-readonly-data-assistant.svg
permalink: /2023/02/13/llm-readonly-data-assistant/
comments: false
---

<!-- generated: timeline-backfill -->

在模型稳定性和工具生态都还不成熟时，数据平台最适合从解释、检索和诊断建议开始，而不是直接改任务。

![大模型进入数据平台先做只读助手](/images/timeline/llm-readonly-data-assistant.svg)

## 架构判断

只读助手可以解释表结构、定位日志片段、生成查询草案，动作边界容易审计。

### 实施时

- 每个回答附上元数据版本和原始证据，模型输出与事实来源分层展示。
- 收集用户采纳、修改和拒绝的数据，为后续开放执行能力建立评测集。

## 留给运维的答案

先把回答做可信，再把动作做自动，是企业场景更稳的演进顺序。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
