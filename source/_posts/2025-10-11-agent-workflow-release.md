---
title: "Agent Workflow 需要像代码一样发布"
date: "2025-10-11 15:28:00"
updated: "2025-10-11 15:28:00"
categories:
- "AI Agent"
tags:
- "Agent Workflow"
- "版本发布"
- "灰度"
description: "可视化编排降低了搭流程的门槛，也容易让生产逻辑在画布上被直接修改。Workflow 仍需要工程发布纪律。 画布是编辑界面，不是版本控制系统；生产 Workflow 必须能 diff、审计和回退。"
cover: /images/timeline/agent-workflow-release.svg
top_img: /images/timeline/agent-workflow-release.svg
permalink: /2025/10/11/agent-workflow-release/
comments: false
---

<!-- generated: timeline-backfill -->

可视化编排降低了搭流程的门槛，也容易让生产逻辑在画布上被直接修改。Workflow 仍需要工程发布纪律。

![Agent Workflow 需要像代码一样发布](/images/timeline/agent-workflow-release.svg)

## 把问题拆开

> 节点配置、Prompt、模型、工具版本和连线一起形成不可变版本。

- 发布前用固定轨迹回归，发布后按用户或任务灰度并监控步骤级指标。
- 运行实例绑定版本，回滚只影响新实例，不篡改正在执行的状态。

## 验收标准

画布是编辑界面，不是版本控制系统；生产 Workflow 必须能 diff、审计和回退。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
