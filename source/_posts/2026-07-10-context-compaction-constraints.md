---
title: "上下文压缩为什么不能丢掉未决约束：摘要不是聊天记录的缩写"
date: "2026-07-10 12:35:52"
updated: "2026-07-10 12:35:52"
categories:
- "AI Agent 工程化"
tags:
- "Context Compaction"
- "上下文工程"
- "约束管理"
description: "把长任务上下文拆成事实、决定、未决问题、权限、操作状态和证据引用，设计可校验的 compaction，避免摘要丢失否定条件与待完成工作。"
cover: /images/articles/context-compaction-constraints.svg
top_img: /images/articles/context-compaction-constraints.svg
permalink: /2026/07/10/context-compaction-constraints/
comments: false
editorial_standard: expert-v1
---

长任务超过上下文窗口后，把前半段对话总结成几段文字再继续，是最直接的压缩方法。它也最容易丢掉关键东西：用户说“不要提交”，摘要只保留了“修改配置”；工具状态仍未知，却被写成“部署失败”；一个尚未回答的问题从列表中消失。

上下文压缩不是文学摘要。它要把后续执行所需的约束和状态，从大量过程文本迁移到更小、可验证的运行表示。哪些可以概括，哪些必须原样保留，应该由信息职责决定，而不是按 token 比例截取。

![上下文压缩的约束保全模型](/images/articles/context-compaction-constraints.svg)

<!-- more -->

## 先把上下文拆成不同职责

我会把长任务信息分为：用户目标与范围、硬约束和禁止项、已确认事实、技术决定及理由、未决问题、任务进度、外部操作状态、证据/产物引用、交流偏好。它们的压缩方式完全不同。

原始日志可以用定位摘要替代，保留查询窗口和 artifact link；已经验证的事实可规范成 claim；用户明确禁止的动作必须逐条保留；外部操作若状态未知，绝不能为了让摘要顺畅而改写成失败或成功。

模型生成的推断与工具直接返回的事实分开。摘要器常把“可能由配置导致”压成“配置导致”，一次压缩就把概率变成结论。每条 claim 带 evidence level 和来源引用，后续模型才能知道是否还需验证。

用户后来的更正覆盖早期信息，但历史理由仍可引用。比如发布日期已从一个日期改为另一个日期，active constraint 只保留新值，同时记录 supersedes；把两句原话都塞进去，会让执行模型再次犹豫。

## 未决约束要用台账，不靠自然语言记忆

为每个约束分配稳定 ID，记录内容、scope、source、created_at、status 和 supersedes。`MUST_NOT_DEPLOY_BEFORE_QA`、`DO_NOT_PRINT_CREDENTIAL` 这类边界进入 active constraint set，每次压缩做集合校验。

未决事项也有状态机：open、in_progress、waiting_external、resolved、dropped_with_reason。摘要器不能因为它在最近几轮没出现就删除；只有明确解决或用户取消，才离开 active set。

任务计划与证据绑定。一个 step 标 completed，必须有 artifact/test/operation outcome；“已经开始写”不等于完成。压缩时从任务源状态生成进度，不让模型根据聊天口吻自行判断。

审批和权限具有作用域与时效。保留批准的具体对象、参数 hash、版本和过期时间，而不是一句“用户同意部署”。后续计划变化时，系统能判断旧批准不可复用。

## 大内容留引用，关键原文留摘录

源码、日志、网页和报告放 artifact store，以 content hash、版本、权限和可定位范围引用。压缩结果写“在 A 的 120–160 行观察到 X”，而不是复制一万行，也不能只写“看过日志”。

关键原文包括用户硬约束、外部 API 的错误码与终态、精确命令参数、schema 和协议字段。它们对一个字符都敏感，适合原样片段；其他解释性内容可结构化归纳。

引用必须可再取。如果临时文件会消失，就在压缩前持久化到 Run artifact；网页可能变化，保存访问时间、URL 与快照 hash。指向当前 latest 的链接不能支撑历史判断。

敏感内容不因“必须原样”就进入摘要。凭证保存 secret reference 与用途，值留在凭证系统；PII 和业务数据按最小必要字段脱敏。压缩副本越多，泄漏面越大。

## Compaction 本身需要输入输出契约

触发压缩时固定 cutoff event、输入 Bundle 和 compactor version。输出不仅有自然语言 summary，还包含 active constraints、claims、open items、artifact refs、operation states 和 discarded categories。新事件从 cutoff 之后追加，避免压缩期间到达的消息丢失。

压缩前后跑不变量：所有 active hard constraints 仍存在；所有 waiting/unknown Operation 仍可定位；未完成 plan nodes 数量一致；引用可读取且 hash 匹配；权限 scope 不扩大；事实没有从 inferred 升级为 verified。

若检查失败，拒绝切换到新 context snapshot，继续用旧版本或减少压缩范围。不能让一个看似流畅的摘要成为唯一历史后再发现约束消失。

多级压缩要防错误累积。第二次不要只总结第一次摘要，关键状态从结构化 source of truth 重新生成，长期事实回看原证据。自然语言摘要可以递归压缩，约束和操作状态不能靠传话。

## 评测重点是后续行为有没有漂移

摘要相似度不是核心指标。我要比较压缩前后 Agent 在同一 continuation 上是否做出一致的安全决定、引用相同事实、保留相同未决项，并在证据不足处同样停止。

测试集专门包含否定条件、后续更正、同名对象、半完成工具、未知副作用、过期审批和多个并行子任务。普通问答摘要很容易通过，这些边界才会暴露 compaction 的危险遗漏。

线上观察 compaction 后 constraint violation、用户重复纠正、旧对象复活、重复 Operation、无法解释的 plan completed 和 artifact missing。发现漂移可回滚到上一 context snapshot 重放，而不是从残缺摘要继续修补。

压缩比也不是越高越好。代码重构任务需要保留变更和测试状态，研究任务需要证据与反例，生产操作需要对象、权限和结果。按任务风险分配 token，宁可早归档大量寒暄，也不能压掉一条“不要执行”。

Context Engineering 最终是在有限窗口里管理工作状态。摘要只是其中一个视图。把未决约束、事实等级、操作状态和证据引用独立出来，Agent 才能在压缩之后继续同一个任务，而不是带着一份看起来像历史的新故事重新开始。

## 对照资料

- [OpenAI Cookbook：Context Engineering](https://cookbook.openai.com/examples/agents_sdk/session_memory)
- [Anthropic：Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [W3C PROV：实体、活动与来源关系](https://www.w3.org/TR/prov-overview/)
- [Temporal：Event History 与 Workflow Replay](https://docs.temporal.io/workflow-execution/event)
