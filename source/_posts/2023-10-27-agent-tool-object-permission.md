---
title: "Agent 工具权限应落到业务对象"
date: "2023-10-27 15:54:31"
updated: "2023-10-27 15:54:31"
categories:
- "AI Agent"
tags:
- "Agent"
- "工具权限"
- "安全"
description: "允许 Agent 调用“查询任务”并不代表它能查询所有任务。权限必须继续落到项目、任务和数据源对象。 工具权限是现有业务权限体系的延伸，不应该另起一套“Agent 特权”。"
cover: /images/timeline/agent-tool-object-permission.svg
top_img: /images/timeline/agent-tool-object-permission.svg
permalink: /2023/10/27/agent-tool-object-permission/
comments: false
---

<!-- generated: timeline-backfill -->

允许 Agent 调用“查询任务”并不代表它能查询所有任务。权限必须继续落到项目、任务和数据源对象。

![Agent 工具权限应落到业务对象](/images/timeline/agent-tool-object-permission.svg)

## 架构判断

1. 工具服务接收真实用户身份，不能统一使用一个后台超级账号。
2. 模型上下文只展示用户可访问对象，执行时再做一次服务端授权，形成双层防线。
3. 拒绝结果返回可解释的权限原因，但不泄露无权对象的敏感属性。

## 留给运维的答案

工具权限是现有业务权限体系的延伸，不应该另起一套“Agent 特权”。

### 延伸资料

- [OpenAI Function Calling](https://openai.com/index/function-calling-and-other-api-updates/)
