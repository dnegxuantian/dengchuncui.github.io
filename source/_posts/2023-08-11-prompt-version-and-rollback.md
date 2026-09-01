---
title: "Prompt 也需要版本与回滚"
date: "2023-08-11 21:53:55"
updated: "2023-08-11 21:53:55"
categories:
- "模型工程"
tags:
- "Prompt"
- "版本管理"
- "灰度"
description: "Prompt 一旦进入生产，就和代码一样会影响行为。在线直接修改一段文本，等于绕过发布流程改逻辑。 Prompt 工程走向生产的标志，是它能被审计、比较和回滚。"
cover: /images/timeline/prompt-version-and-rollback.svg
top_img: /images/timeline/prompt-version-and-rollback.svg
permalink: /2023/08/11/prompt-version-and-rollback/
comments: false
---

<!-- generated: timeline-backfill -->

Prompt 一旦进入生产，就和代码一样会影响行为。在线直接修改一段文本，等于绕过发布流程改逻辑。

![Prompt 也需要版本与回滚](/images/timeline/prompt-version-and-rollback.svg)

## 别急着换组件

> 系统指令、示例、工具说明和检索模板分别版本化，发布时组合成不可变快照。

- 每次请求记录实际使用的 Prompt 版本，而不是只保留当前配置。
- 灰度比较任务成功率、拒答率和工具错误，指标恶化时可以一键回退。

## 实施顺序

Prompt 工程走向生产的标志，是它能被审计、比较和回滚。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
