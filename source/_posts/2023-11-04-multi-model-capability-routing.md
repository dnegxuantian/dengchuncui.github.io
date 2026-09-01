---
title: "多模型路由先按能力分层"
date: "2023-11-04 20:08:43"
updated: "2023-11-04 20:08:43"
categories:
- "模型工程"
tags:
- "模型路由"
- "成本"
- "可靠性"
description: "模型路由如果只按价格或随机权重分流，很容易把工具调用任务送给不稳定的模型。能力边界应先于成本优化。 好的路由不是永远返回结果，而是在能力不足时诚实地守住接口契约。"
cover: /images/timeline/multi-model-capability-routing.svg
top_img: /images/timeline/multi-model-capability-routing.svg
permalink: /2023/11/04/multi-model-capability-routing/
comments: false
---

<!-- generated: timeline-backfill -->

模型路由如果只按价格或随机权重分流，很容易把工具调用任务送给不稳定的模型。能力边界应先于成本优化。

![多模型路由先按能力分层](/images/timeline/multi-model-capability-routing.svg)

## 把问题拆开

建立结构化输出、长上下文、工具调用、中文理解等能力基线，并记录模型版本。

路由规则用任务标签和风险等级匹配，不让业务方直接依赖供应商型号。

## 验收标准

降级时明确哪些能力会丢失；无法满足契约就失败，不要静默换成普通文本回答。

好的路由不是永远返回结果，而是在能力不足时诚实地守住接口契约。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
