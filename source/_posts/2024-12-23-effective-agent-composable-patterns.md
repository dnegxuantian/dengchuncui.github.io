---
title: "读完 Building Effective Agents：我更认同用小模式组合，而不是先选大框架"
date: "2024-12-23 10:12:44"
updated: "2024-12-23 10:12:44"
categories:
- "AI Agent 工程化"
tags:
- "Agent 架构"
- "Composable Patterns"
- "Workflow"
description: "结合 Anthropic 2024-12-19 发布的 Building Effective Agents，按任务画像选择 Prompt Chaining、Routing、Parallelization、Orchestrator-Workers、Evaluator-Optimizer 与 Agent。"
cover: /images/articles/effective-agent-composable-patterns.svg
top_img: /images/articles/effective-agent-composable-patterns.svg
permalink: /2024/12/23/effective-agent-composable-patterns/
comments: false
editorial_standard: expert-v1
---

Anthropic 12 月 19 日发布《Building effective agents》，其中一句和我的工程经验很一致：成功实现更常使用简单、可组合的模式，而不是复杂框架。Agent 架构不是功能越多越好，关键是任务到底需要哪种自由度。

我不会拿一个通用 Agent loop 处理所有问题。路径已知就做 chaining，类别明确就 routing，子任务独立就 parallelization，拆分动态才用 orchestrator-workers，需要反复改进就 evaluator-optimizer，真正开放探索才进入 autonomous agent。

![用小模式组合 Agent，而不是先上复杂框架](/images/articles/effective-agent-composable-patterns.svg)

<!-- more -->

## 先画任务画像，再选模式

选择前我会问：成功标准能否写成断言，步骤是否可预先枚举，子任务是否独立，外部动作是否有副作用，中间结果是否需要人确认，失败能否重试或补偿。

数据平台里“生成 SQL 并验证”路径很稳定：理解口径、取 schema、生成、parser/catalog/plan、受控执行、结果断言。它适合 Workflow chaining，不需要模型每次重新发明步骤。

“调查一个未知代码库中的故障”可能需要根据中间发现选择文件和工具，更适合 Agent；但生产操作仍从 Agent 中拿出来，交给固定工具契约和确认节点。

任务画像进入设计文档和评测桶。不能因为框架提供 multi-agent 按钮，就把每个任务拆成多个角色。通信、重复上下文和结果合并都有成本。

## Prompt Chaining 用 Gate 连接

Chaining 把复杂任务拆成固定步骤，每步模型输入更小，输出更容易验证。关键不是“多调几次模型”，而是步骤之间有 gate。

例如先提取问题中的指标/时间/维度，schema 验证通过再检索 Catalog；SQL 生成后必须过真实引擎验证，才进入解释。前一步不确定时追问，不把错误结构继续放大。

每步固定 Bundle、输入输出 artifact 和 attempts。失败可以从 gate 恢复，改 extractor 不必重跑已经固定的源数据。总 deadline 和成本由外层 Workflow 管理。

链太长也会造成信息损失。下游只拿结构化结论，同时保留 evidence refs，需要时回看原始材料；不要层层摘要直到事实条件消失。

## Routing 先做硬约束

Routing 适合按问题类型、风险或模型能力选择专用路径。先用规则/轻模型分类，再路由到 SQL、知识问答、运维诊断或人工。

硬约束优先：用户权限、数据域、工具需求、上下文长度、语言和环境。满足后才比较模型质量、延迟与成本。分类低置信时走通用安全路径或追问，不把一个错误类别直接带进有副作用的工具链。

路由结果带 reason、policy version 和候选。线上反馈按任务桶更新，不能只看全站平均成功率。fallback 仍必须满足原能力和数据边界。

这类路由往往比“一个万能 Prompt”更容易维护，因为每条路径的上下文、工具和评测都更窄。

## Parallelization 只并行真正独立的工作

多个文档分别提取事实、多个候选 SQL 各自 EXPLAIN、代码库不同模块检索，可以并行。并行前冻结共享输入，子任务有独立 ID、deadline 和结果 schema。

聚合器不能只把所有文本拼接。它按 object/claim/evidence 去重、处理冲突，等待策略明确 all/quorum/first-valid。高风险事实通常要 all required evidence，普通搜索可接受 top valid。

并行会放大限流和成本。全局并发、token 与工具配额由 runtime 控制，子任务取消能传播。一个分支失败时，结果标 partial，不让聚合模型假装全部完成。

Voting 是 parallelization 的一种，但多个模型一致不等于事实正确。它们可能共享同一错误上下文。最终仍看外部 evidence 和确定断言。

## Orchestrator-Workers 需要交接契约

任务无法预先知道子任务数量时，orchestrator 动态拆分，workers 执行。拆分结果必须结构化：task ID、objective、allowed tools、input artifacts、expected output、deadline、budget 和 completion criteria。

worker 不能看到整个主 Agent 的所有工具和秘密，只获得子任务最小 scope。输出带 evidence 和 status，orchestrator 不根据“我已完成”的自然语言直接关闭任务。

重复/重叠子任务通过 normalized objective 和 resource scope 检测。worker 失败可重试或重新分配，但 side-effect operation 先对账，不能重复执行。

共享状态由持久化 task board/artifact store 管理，不靠模型互相转述。交接越显式，multi-agent 越容易观测；否则只是把一个不可解释 loop 拆成多个。

## Evaluator-Optimizer 要有限迭代

适合有明确质量标准、一次生成难达标的任务，例如 SQL 优化、报告证据完整性、代码测试修复。generator 提出候选，evaluator 返回结构化 violations 与 evidence，optimizer 针对问题改动。

evaluator 尽量使用真实 parser、tests、schema、policy 和 claim-evidence 检查。另一个模型可以做语言质量评审，不能替代引擎和权限事实。

循环有 max iterations、deadline 和 no-progress detection。连续两轮相同 violation 或结果未变化就停止，转人工。每轮保存 diff，避免模型在修 A 时又退化 B 而总分碰巧不变。

最终发布必须通过守门断言，不是 evaluator 给出“看起来很好”。

## Autonomous Agent 是最后一种模式

Agent 适合开放任务和可信环境中的灵活探索。它需要清晰目标、环境反馈和停止条件，工具定义质量直接决定表现。Anthropic 的文章也强调从简单方案开始，只在需要时增加复杂度。

开放 loop 仍受状态机、权限、预算、sandbox、证据和回放控制。模型决定下一步，runtime 决定这个动作是否允许、是否已执行、何时停止。

生产系统常是混合结构：外层 Workflow 负责阶段和审批，某个研究节点内部运行 Agent，结果通过 gate 后回到固定流程。无需在“工作流还是 Agent”之间二选一。

框架是否好用，最后看它有没有隐藏状态和协议。能否查看每一步输入输出、固定版本、替换模型、模拟工具、取消恢复和回放，比提供多少预置角色更重要。

简单模式不是功能少，而是每一层复杂度有具体理由。先用任务画像选择最小模式，再把状态、证据、预算和权限放进统一运行底座，Agent 系统才容易验证，也能随着业务需要逐步增加自由度。

## 对照官方文章与论文

- [Anthropic 2024-12-19：Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [ReAct：Reasoning 与 Acting 交错模式](https://arxiv.org/abs/2210.03629)
- [Plan-and-Solve Prompting：先规划再执行](https://arxiv.org/abs/2305.04091)
- [OpenAI 2023 Function Calling：模型与外部工具的结构化连接](https://openai.com/index/function-calling-and-other-api-updates/)
