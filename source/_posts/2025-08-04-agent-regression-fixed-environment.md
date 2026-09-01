---
title: "Agent 回归要固定工具与数据版本"
date: "2025-08-04 18:57:37"
updated: "2025-08-04 18:57:37"
categories:
- "AI Agent"
tags:
- "Agent 评测"
- "回归测试"
- "版本"
description: "同一条评测今天通过、明天失败，可能是模型变化，也可能是工具返回和知识库内容变了。环境不固定就无法归因。 回归测试的前提是输入世界可描述；否则分数波动没有工程解释。"
cover: /images/timeline/agent-regression-fixed-environment.svg
top_img: /images/timeline/agent-regression-fixed-environment.svg
permalink: /2025/08/04/agent-regression-fixed-environment/
comments: false
---

<!-- generated: timeline-backfill -->

同一条评测今天通过、明天失败，可能是模型变化，也可能是工具返回和知识库内容变了。环境不固定就无法归因。

![Agent 回归要固定工具与数据版本](/images/timeline/agent-regression-fixed-environment.svg)

## 别急着换组件

评测运行记录模型、Prompt、工具 Schema、数据快照和随机参数版本。

### 实施时

- 离线回归使用录制工具结果验证编排，在线抽测再检查真实系统兼容性。
- 结果差异定位到具体步骤和证据，避免用最终文本相似度代替任务正确性。

## 实施顺序

回归测试的前提是输入世界可描述；否则分数波动没有工程解释。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
