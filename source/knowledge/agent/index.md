---
wiki: agent-engineering
title: 阅读入口
seo_title: AI Agent 工程化
description: 邓明瑞关于 AI Agent 工具调用、MCP、上下文、评测、可观测性和生产运行的体系化技术索引。
date: 2026-09-02 15:36:00
updated: 2026-09-02 15:36:00
robots: index,follow
sitemap: true
comments: false
---

我把 Agent 看成一个会读取上下文、调用工具并改变外部状态的运行系统。模型只是其中一层，真正决定能否进入生产的是权限、状态、事件、失败恢复和回归验证。

## 两条阅读主线

1. [工具与边界](./tools-and-boundaries/)：工具定义、MCP 接口、远程信任和执行权限。
2. [可观测与生产化](./observability-and-production/)：轨迹、评测、运行手册和可验证执行。

这组文章不会把 Demo 能跑等同于系统可用。每个方案都要回答：工具到底执行了什么、失败发生在哪一层，以及修改以后怎样证明问题没有回来。
