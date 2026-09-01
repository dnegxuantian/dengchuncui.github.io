---
title: "执行型 Agent 的 Sandbox 要有清单"
date: "2026-04-08 14:28:06"
updated: "2026-04-08 14:28:06"
categories:
- "AI Agent"
tags:
- "Sandbox"
- "代码执行"
- "安全"
description: "允许 Agent 读文件、运行命令以后，Sandbox 不能只是“放进容器”。它需要明确可见资源与可执行能力。 Sandbox 的价值是让能力可声明、影响可限制、结果可审计。"
cover: /images/timeline/agent-sandbox-manifest.svg
top_img: /images/timeline/agent-sandbox-manifest.svg
permalink: /2026/04/08/agent-sandbox-manifest/
comments: false
---

<!-- generated: timeline-backfill -->

允许 Agent 读文件、运行命令以后，Sandbox 不能只是“放进容器”。它需要明确可见资源与可执行能力。

![执行型 Agent 的 Sandbox 要有清单](/images/timeline/agent-sandbox-manifest.svg)

## 把问题拆开

1. 用清单声明挂载目录、网络目标、命令白名单、环境变量与资源上限。
2. 工作区按任务隔离，产物通过显式出口交付，不能默认访问宿主目录。
3. 执行日志包含命令、退出码、资源消耗和文件变更摘要，支持事后复核。

## 验收标准

Sandbox 的价值是让能力可声明、影响可限制、结果可审计。

### 延伸资料

- [OpenAI: The next evolution of the Agents SDK](https://openai.com/index/the-next-evolution-of-the-agents-sdk/)
