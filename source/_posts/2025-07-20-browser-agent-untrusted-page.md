---
title: "浏览器 Agent 必须把页面当不可信输入"
date: "2025-07-20 13:36:11"
updated: "2025-07-20 13:36:11"
categories:
- "AI Agent"
tags:
- "Browser Agent"
- "Prompt Injection"
- "安全"
description: "浏览器 Agent 同时读取页面和执行点击，页面文本有机会影响动作决策，因此不能把 DOM 内容当系统指令。 浏览器自动化的安全边界是页面能提供事实，但不能给 Agent 授权。"
cover: /images/timeline/browser-agent-untrusted-page.svg
top_img: /images/timeline/browser-agent-untrusted-page.svg
permalink: /2025/07/20/browser-agent-untrusted-page/
comments: false
---

<!-- generated: timeline-backfill -->

浏览器 Agent 同时读取页面和执行点击，页面文本有机会影响动作决策，因此不能把 DOM 内容当系统指令。

![浏览器 Agent 必须把页面当不可信输入](/images/timeline/browser-agent-untrusted-page.svg)

## 别急着换组件

- 页面内容只作为数据进入独立通道，工具策略不接受页面要求提升权限或访问其他站点。
- 提交表单前重新展示目标、字段和副作用，高风险动作交给用户确认。
- 记录每次可见页面状态与动作理由，失败后能判断是页面变化还是模型误判。

## 实施顺序

浏览器自动化的安全边界是页面能提供事实，但不能给 Agent 授权。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
