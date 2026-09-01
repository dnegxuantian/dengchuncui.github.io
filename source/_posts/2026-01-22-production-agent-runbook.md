---
title: "生产 Agent 需要一份故障运行手册"
date: "2026-01-22 20:15:14"
updated: "2026-01-22 20:15:14"
categories:
- "AI Agent"
tags:
- "Runbook"
- "生产化"
- "故障诊断"
description: "Agent 出问题时，值班人员不能从“模型偶尔不稳定”开始猜。故障手册要把链路拆到可检查的层。 Agent 运维成熟的标志，是问题能被分类、复现和验证，而不是靠换模型碰运气。"
cover: /images/timeline/production-agent-runbook.svg
top_img: /images/timeline/production-agent-runbook.svg
permalink: /2026/01/22/production-agent-runbook/
comments: false
---

<!-- generated: timeline-backfill -->

Agent 出问题时，值班人员不能从“模型偶尔不稳定”开始猜。故障手册要把链路拆到可检查的层。

![生产 Agent 需要一份故障运行手册](/images/timeline/production-agent-runbook.svg)

## 我会先看三组证据

1. 先判定是上下文、模型、工具、协议还是持久化问题，再进入对应证据。
2. 为常见故障准备只读检查、降级方式和停止条件，禁止现场临时放大权限。
3. 修复后用原始轨迹回放，并补入评测集，形成诊断到回归的闭环。

## 取舍

Agent 运维成熟的标志，是问题能被分类、复现和验证，而不是靠换模型碰运气。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
