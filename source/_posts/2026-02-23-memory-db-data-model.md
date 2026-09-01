---
title: "Memory DB 不是一张 conversations 表"
date: "2026-02-23 20:13:00"
updated: "2026-02-23 20:13:00"
categories:
- "AI Agent"
tags:
- "Memory DB"
- "长期记忆"
- "数据模型"
description: "把历史消息全部存起来并不构成 Memory DB。长期记忆需要可更新、可失效、可追溯的事实单元。 Memory DB 管理的是 Agent 可以依赖的长期状态，不是聊天记录的冷备份。"
cover: /images/timeline/memory-db-data-model.svg
top_img: /images/timeline/memory-db-data-model.svg
permalink: /2026/02/23/memory-db-data-model/
comments: false
---

<!-- generated: timeline-backfill -->

把历史消息全部存起来并不构成 Memory DB。长期记忆需要可更新、可失效、可追溯的事实单元。

![Memory DB 不是一张 conversations 表](/images/timeline/memory-db-data-model.svg)

## 问题通常出在哪

记忆实体包含主体、事实、来源、置信度、有效期和权限域。

## 判断是否有效

- 新事实与旧事实冲突时保留演变关系，不直接覆盖到无法追溯。
- 召回同时考虑任务相关性、时间与权限，向量相似度只占其中一部分。

Memory DB 管理的是 Agent 可以依赖的长期状态，不是聊天记录的冷备份。

### 延伸资料

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18)
