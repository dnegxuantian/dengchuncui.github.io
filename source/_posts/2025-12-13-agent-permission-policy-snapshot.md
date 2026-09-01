---
title: "Agent 权限审计要还原当时策略"
date: "2025-12-13 18:16:07"
updated: "2025-12-13 18:16:07"
categories:
- "AI Agent"
tags:
- "权限审计"
- "策略版本"
- "合规"
description: "审计一次历史工具调用时，只看当前权限配置可能得出错误结论。需要还原调用发生时的策略。 可审计不是有日志，而是能解释当时为什么允许这个动作发生。"
cover: /images/timeline/agent-permission-policy-snapshot.svg
top_img: /images/timeline/agent-permission-policy-snapshot.svg
permalink: /2025/12/13/agent-permission-policy-snapshot/
comments: false
---

<!-- generated: timeline-backfill -->

审计一次历史工具调用时，只看当前权限配置可能得出错误结论。需要还原调用发生时的策略。

![Agent 权限审计要还原当时策略](/images/timeline/agent-permission-policy-snapshot.svg)

## 别急着换组件

运行记录保存用户身份、授权范围、策略版本和工具版本。

## 实施顺序

- 权限判断输出命中规则与决策结果，拒绝和允许都进入审计。
- 策略变更保留生效区间，支持按时间点复算而不是覆盖旧配置。

可审计不是有日志，而是能解释当时为什么允许这个动作发生。

### 延伸资料

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18)
