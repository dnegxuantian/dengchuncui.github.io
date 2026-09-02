---
wiki: agent-engineering
title: 可观测与生产化
permalink: /knowledge/agent/observability-and-production/
description: AI Agent 执行轨迹、错误样本评测、决策责任、持久化执行和生产 Runbook。
date: 2026-09-02 15:38:00
updated: 2026-09-02 15:38:00
robots: index,follow
sitemap: true
comments: false
---

## 先让失败能够被还原

- {% post_link 2024-01-04-llm-run-observability "LLM 运行可观测性不能只记最终答案" %}
- {% post_link 2024-08-18-agent-eval-from-failures "Agent 评测为什么要从真实失败样本开始" %}
- {% post_link 2024-09-04-agent-trace-replay "Agent Trace Replay 如何复现一次错误执行" %}
- {% post_link 2025-03-20-agent-trace-decision-owner "Agent Trace 为什么要记录决策责任" %}

最终答案只是执行结果的一部分。排查问题需要把模型输出、工具参数、工具结果、状态变化和流式事件关联到同一个运行标识。

## 再讨论持续运行

- {% post_link 2025-10-11-agent-workflow-release "Agent Workflow 为什么需要正式发布流程" %}
- {% post_link 2025-12-03-agent-durable-execution "Agent 持久化执行需要保存什么" %}
- {% post_link 2026-01-22-production-agent-runbook "生产 Agent 为什么必须有 Runbook" %}
- {% post_link 2026-08-20-data-platform-agent-verifiable-execution "数据平台 Agent 如何形成可验证执行闭环" %}

生产化不是把超时时间调长。长任务需要可恢复状态、幂等工具、人工接管点和明确的回归样本；涉及数据平台时，还要保留 SQL、任务实例和资源状态等执行证据。
