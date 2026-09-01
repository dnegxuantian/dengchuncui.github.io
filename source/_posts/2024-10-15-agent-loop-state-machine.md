---
title: "Agent 循环必须有显式状态机"
date: "2024-10-15 16:06:40"
updated: "2024-10-15 16:06:40"
categories:
- "AI Agent"
tags:
- "Agent Loop"
- "状态机"
- "失败恢复"
description: "把“模型继续回答直到完成”写成 while 循环，遇到工具超时、参数修正和人工确认就会失去控制。 Agent Loop 的可靠性来自状态机和预算，不来自模型承诺它已经完成。"
cover: /images/timeline/agent-loop-state-machine.svg
top_img: /images/timeline/agent-loop-state-machine.svg
permalink: /2024/10/15/agent-loop-state-machine/
comments: false
---

<!-- generated: timeline-backfill -->

把“模型继续回答直到完成”写成 while 循环，遇到工具超时、参数修正和人工确认就会失去控制。

![Agent 循环必须有显式状态机](/images/timeline/agent-loop-state-machine.svg)

## 别急着换组件

状态至少区分计划、等待工具、等待确认、继续生成、完成与失败。

每次迁移持久化事件和版本，服务重启后从最后确定状态恢复。

## 实施顺序

限制总轮次、总成本和重复工具调用，触发上限时给出可解释的停止原因。

Agent Loop 的可靠性来自状态机和预算，不来自模型承诺它已经完成。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
