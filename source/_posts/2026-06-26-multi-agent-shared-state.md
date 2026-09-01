---
title: "多 Agent 并发要控制共享状态"
date: "2026-06-26 08:20:43"
updated: "2026-06-26 08:20:43"
categories:
- "AI Agent"
tags:
- "Multi-Agent"
- "并发"
- "共享状态"
description: "并行子任务能缩短时间，也会带来重复写、上下文覆盖和结果先后不确定。共享状态必须显式管理。 并发的目标是缩短独立工作，不应把一致性问题交给最终回答临时消化。"
cover: /images/timeline/multi-agent-shared-state.svg
top_img: /images/timeline/multi-agent-shared-state.svg
permalink: /2026/06/26/multi-agent-shared-state/
comments: false
---

<!-- generated: timeline-backfill -->

并行子任务能缩短时间，也会带来重复写、上下文覆盖和结果先后不确定。共享状态必须显式管理。

![多 Agent 并发要控制共享状态](/images/timeline/multi-agent-shared-state.svg)

## 架构判断

1. 子任务拥有独立工作区和输出契约，只通过汇总节点写入根任务。
2. 同一业务对象的写操作串行化或使用版本条件，避免最后提交者覆盖。
3. 汇总等待必要结果而非全部结果，对超时子任务保留缺口说明。

## 留给运维的答案

并发的目标是缩短独立工作，不应把一致性问题交给最终回答临时消化。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
