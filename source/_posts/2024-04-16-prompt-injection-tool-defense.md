---
title: "Prompt Injection 防线应在工具侧"
date: "2024-04-16 08:55:12"
updated: "2024-04-16 08:55:12"
categories:
- "AI Agent"
tags:
- "Prompt Injection"
- "工具安全"
- "Agent"
description: "把“忽略恶意指令”写进系统提示词不够。只要模型能接触外部内容，防线就必须下沉到工具与权限层。 模型可以被诱导，系统不能因此失去边界；安全性应建立在确定代码上。"
cover: /images/timeline/prompt-injection-tool-defense.svg
top_img: /images/timeline/prompt-injection-tool-defense.svg
permalink: /2024/04/16/prompt-injection-tool-defense/
comments: false
---

<!-- generated: timeline-backfill -->

把“忽略恶意指令”写进系统提示词不够。只要模型能接触外部内容，防线就必须下沉到工具与权限层。

![Prompt Injection 防线应在工具侧](/images/timeline/prompt-injection-tool-defense.svg)

## 架构判断

检索内容始终按不可信数据处理，不允许它改变系统指令和工具权限。

高风险工具采用参数白名单、业务校验和人工确认，模型判断不能替代服务端规则。

## 留给运维的答案

日志区分用户输入、外部内容和系统指令，复盘时才能看清指令从哪里进入。

模型可以被诱导，系统不能因此失去边界；安全性应建立在确定代码上。

### 延伸资料

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
