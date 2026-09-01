---
title: "Memory DB 不是一张 conversations 表：把事实、经历和索引分开建模"
date: "2026-02-23 20:13:00"
updated: "2026-02-23 20:13:00"
categories:
- "AI Agent 工程化"
tags:
- "Memory DB"
- "Agent Memory"
- "数据建模"
description: "从生产数据模型拆解 Agent Memory：原始事件、事实命题、经历摘要、检索索引和策略状态分别治理，处理来源、时效、冲突、删除和评测。"
cover: /images/articles/memory-db-data-model.svg
top_img: /images/articles/memory-db-data-model.svg
permalink: /2026/02/23/memory-db-data-model/
comments: false
editorial_standard: expert-v1
---

把所有对话按用户 ID 存下来，再做 embedding，通常就被叫作“长期记忆”。这个方案演示很快，生产问题也来得快：用户改了偏好，旧片段仍被召回；一句推测被当成事实；删除账户后，向量索引里还残留副本。

Memory DB 不是消息归档的别名。它要管理记忆如何产生、依据什么、何时有效、与谁冲突、能否被检索、何时遗忘。原始经历、提炼事实和检索索引承担不同职责，不能混在一张 `conversations` 表里。

![Agent Memory 的分层数据模型](/images/articles/memory-db-data-model.svg)

<!-- more -->

## 原始事件是证据，不直接等于记忆

会话消息、工具调用、用户反馈、任务结果和人工修改先进入 append-only event store。事件保存主体、时间、来源、Run/Step、内容引用、权限域与 retention class。它回答“当时发生了什么”，不保证每句话都真实。

模型说“用户喜欢 PostgreSQL”只是一次输出；用户明确说“以后 SQL 示例用 PostgreSQL”才是候选偏好；工具查到组织字段，也只能在授权范围和数据版本内使用。写入记忆前必须标 source type 与 evidence references。

大内容不复制到每条记录。附件、网页快照和工具结果放对象/文档存储，事件保留不可变版本引用、摘要和 hash。这样重建时能找到原始材料，也能在删除时知道有哪些派生副本。

事件有自己的访问边界。A 项目的会话不能因为同一用户就被 B 项目召回，管理员调试记录也不能成为普通会话上下文。tenant、workspace、project、purpose 与 sensitivity 都是存储键的一部分，不是检索后的过滤补丁。

## 事实、偏好和过程经验不是一种记录

我会至少拆三类可用记忆。Semantic memory 保存可陈述事实或偏好，如技术栈、术语映射、稳定的工作约束；episodic memory 保存一次任务怎样完成、遇到什么失败；procedural memory 保存经验证的流程、工具顺序和安全边界。

事实表用 canonical subject-predicate-object/value 表达，并保存 `valid_from/valid_to`、confidence、evidence、extraction version 与 status。自然语言文本仍可保留，但不能只靠一段 summary 承载所有语义。用户明确修正时，旧事实结束有效期，新事实建立 supersedes 关系。

偏好带作用域和强度。“我这次想看 Java”不应升级为永久语言偏好；“所有生产命令先给只读版本”可以是全局工作习惯。提取器需要区分单次指令、阶段目标和长期偏好，低置信候选先不注入。

过程经验不直接变成 Skill。一次任务成功可能包含偶然步骤，至少要有多次证据、失败对照或人工确认，才能进入稳定 procedure。procedure 记录前置条件、动作、验收、风险和适用版本，避免把结果摘要当操作规范。

## 冲突不是按最后更新时间覆盖

Memory 最难的不是写入，而是新证据与旧记录矛盾。简单 last-write-wins 会让低可信的模型猜测覆盖用户明确声明，也会把某项目局部事实覆盖组织全局事实。

合并先比较主体、作用域、predicate 和有效时间，再根据 source authority、evidence quality 与 recency 判定。结果可以是 replace、coexist、pending conflict 或 reject。冲突无法自动解决时保留两份候选，在使用前询问或避免依赖。

数值和状态类事实通常 TTL 短，身份与工程习惯可能较长；法规、组织权限和数据口径需要来源版本。TTL 到期不是删除证据，而是从 active memory 退出，重新验证后生成新版本。

每次读取返回 `memory_id/version` 和 reason。Agent 最终回答若依赖某条记忆，trace 能指出它；用户说“这不是我的偏好”时，系统才知道改哪一条，而不是盲目清空全部聊天。

## 向量索引只是读取投影

向量、关键词、图关系和时间索引都是派生 projection，不是事实源。索引文档包含 memory version、权限 scope、validity、sensitivity 与删除 tombstone。召回后必须回源验证记录仍 active、仍授权、仍符合当前目的。

近似向量检索适合找语义相关候选，但对精确身份、时间与否定关系不可靠。“不再使用 MySQL”与“使用 MySQL”很相近，只有结构化 predicate 和有效期能区分。排序应综合语义、时效、权威、任务相关性和重复度。

上下文预算也会反向约束 Memory。不是召回越多越好。我会先选择可回答当前决策的最小事实集，再补少量相关经历；同一事实的十次重复证据用聚合引用表达，避免形成虚假的多数优势。

索引重建必须可重复。给定某一 memory snapshot 与 embedding/index version，能生成同一逻辑集合；迁移时双写或离线构建、对比召回再切换。把向量库当唯一存储，一旦重嵌入或误删很难审计。

## 删除、保留和评测要一起设计

用户删除一段会话，要沿 lineage 找到事件、抽取事实、摘要、embedding、缓存和训练/评测副本。立即生成 tombstone 阻止读取，后台清理各投影并记录完成状态。备份按既定周期过期，不能宣称瞬间从所有介质消失。

“忘记这件事”还可能是语义撤回而非物理删除：用户要求不再使用某偏好，旧记录因审计保留但状态 revoked，不再进入上下文。产品需要把这两种操作说清楚。

Memory 评测分写入和读取。写入看事实抽取准确率、作用域、冲突处理、敏感信息误存；读取看必要事实召回、过期/越权泄露、错误记忆影响和上下文成本。最终还要看任务结果，召回到正确事实却被模型忽略，同样是失败。

我会保留一套带时间演化的数据：先声明偏好、临时例外、明确修改、跨项目切换、撤回、账户删除。只测单轮问答命中率，发现不了 Memory DB 真正的生命周期问题。

一个能上线的 Memory 系统，首先是有来源、有版本、有权限、有遗忘机制的数据系统，然后才是检索功能。把这一层做清楚，Agent 才是在使用历史，而不是被旧聊天片段牵着走。

## 对照资料

- [MemGPT：用分层存储管理 LLM 上下文](https://arxiv.org/abs/2310.08560)
- [Generative Agents：观察、反思与规划式记忆](https://arxiv.org/abs/2304.03442)
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)
- [OpenLineage：用 Run、Job、Dataset 事件描述数据血缘](https://openlineage.io/docs/spec/object-model/)
