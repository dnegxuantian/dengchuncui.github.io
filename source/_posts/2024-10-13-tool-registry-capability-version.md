---
title: "工具注册中心要管理能力版本"
date: "2024-10-13 18:21:30"
updated: "2024-10-13 18:21:30"
categories:
- "AI Agent"
tags:
- "工具注册"
- "Schema"
- "版本管理"
description: "工具多起来以后，靠在 Prompt 里手写几十段定义无法维护。注册中心需要管理的不只是地址，还有能力版本。 工具注册中心是 Agent 的能力目录，也是执行边界的控制面。"
cover: /images/timeline/tool-registry-capability-version.svg
top_img: /images/timeline/tool-registry-capability-version.svg
permalink: /2024/10/13/tool-registry-capability-version/
comments: false
---

<!-- generated: timeline-backfill -->

工具多起来以后，靠在 Prompt 里手写几十段定义无法维护。注册中心需要管理的不只是地址，还有能力版本。

![工具注册中心要管理能力版本](/images/timeline/tool-registry-capability-version.svg)

## 架构判断

- 每个工具记录 Schema、权限域、幂等性、风险级别、超时和负责人。
- 破坏性变更发布新版本，旧 Agent 在迁移完成前仍能按原契约调用。
- 模型只获得当前任务需要的工具子集，减少误选和上下文占用。

## 留给运维的答案

工具注册中心是 Agent 的能力目录，也是执行边界的控制面。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
