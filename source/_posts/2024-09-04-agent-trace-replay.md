---
title: "一条 Agent Trace 应该能重放"
date: "2024-09-04 11:17:11"
updated: "2024-09-04 11:17:11"
categories:
- "AI Agent"
tags:
- "Trace"
- "可重放"
- "可观测性"
description: "Trace 如果只有瀑布图，排查时仍然无法还原模型看到了什么、工具返回了什么。 可重放不是为了复制模型随机性，而是固定证据后验证系统处理是否一致。"
cover: /images/timeline/agent-trace-replay.svg
top_img: /images/timeline/agent-trace-replay.svg
permalink: /2024/09/04/agent-trace-replay/
comments: false
---

<!-- generated: timeline-backfill -->

Trace 如果只有瀑布图，排查时仍然无法还原模型看到了什么、工具返回了什么。

![一条 Agent Trace 应该能重放](/images/timeline/agent-trace-replay.svg)

## 先看边界

- 保存指令版本、上下文引用、模型与参数、工具输入输出和结束原因。
- 外部数据记录内容指纹与版本，避免重放时拿到已经变化的结果。
- 提供脱离真实写工具的 Dry-run 模式，用同一轨迹验证转换与决策逻辑。

## 落地时我会盯住什么

可重放不是为了复制模型随机性，而是固定证据后验证系统处理是否一致。

### 延伸资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
