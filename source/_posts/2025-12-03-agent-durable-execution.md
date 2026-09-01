---
title: "长任务需要 Durable Execution"
date: "2025-12-03 11:09:06"
updated: "2025-12-03 11:09:06"
categories:
- "AI Agent"
tags:
- "Durable Execution"
- "长任务"
- "状态恢复"
description: "运行十几分钟甚至跨人工审批的 Agent，不能依赖一个 HTTP 请求和进程内内存活到最后。 长任务的可靠性来自持久状态与幂等，不来自更长的超时时间。"
cover: /images/timeline/agent-durable-execution.svg
top_img: /images/timeline/agent-durable-execution.svg
permalink: /2025/12/03/agent-durable-execution/
comments: false
---

<!-- generated: timeline-backfill -->

运行十几分钟甚至跨人工审批的 Agent，不能依赖一个 HTTP 请求和进程内内存活到最后。

![长任务需要 Durable Execution](/images/timeline/agent-durable-execution.svg)

## 别急着换组件

每个步骤完成后持久化状态、输入输出和下一步条件，进程退出后可从检查点恢复。

### 实施时

- 外部工具使用幂等键，恢复时先查询执行结果，避免重复写入。
- 等待用户或定时事件进入挂起状态，不占用工作线程和模型连接。

## 实施顺序

长任务的可靠性来自持久状态与幂等，不来自更长的超时时间。

### 延伸资料

- [OpenAI: New tools for building agents](https://openai.com/index/new-tools-for-building-agents/)
