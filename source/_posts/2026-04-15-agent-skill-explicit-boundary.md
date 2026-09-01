---
title: "Agent Skill 要把隐性经验写成边界"
date: "2026-04-15 17:29:52"
updated: "2026-04-15 17:29:52"
categories:
- "AI Agent"
tags:
- "Agent Skill"
- "工具使用"
- "工程规范"
description: "Skill 不只是提示词模板。它应该告诉 Agent 何时使用、要读取什么证据、哪些动作不能自行扩大。 好的 Skill 像一份可执行工程规范：减少自由猜测，又保留必要判断。"
cover: /images/timeline/agent-skill-explicit-boundary.svg
top_img: /images/timeline/agent-skill-explicit-boundary.svg
permalink: /2026/04/15/agent-skill-explicit-boundary/
comments: false
---

<!-- generated: timeline-backfill -->

Skill 不只是提示词模板。它应该告诉 Agent 何时使用、要读取什么证据、哪些动作不能自行扩大。

![Agent Skill 要把隐性经验写成边界](/images/timeline/agent-skill-explicit-boundary.svg)

## 架构判断

触发条件写清正向场景和反例，避免相邻任务误用能力。

## 留给运维的答案

- 操作步骤包含验证点与失败分支，不把关键判断藏在示例里。
- 高风险动作保留用户确认和权限边界，Skill 不能替用户授权。

好的 Skill 像一份可执行工程规范：减少自由猜测，又保留必要判断。

### 延伸资料

- [OpenAI: The next evolution of the Agents SDK](https://openai.com/index/the-next-evolution-of-the-agents-sdk/)
