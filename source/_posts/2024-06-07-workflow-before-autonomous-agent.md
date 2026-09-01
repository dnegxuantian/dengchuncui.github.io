---
title: "企业 Agent 先做 Workflow：自由度应该放在真正需要判断的地方"
date: "2024-06-07 14:02:45"
updated: "2024-06-07 14:02:45"
categories:
- "AI Agent 工程化"
tags:
- "Agent Workflow"
- "工程架构"
- "可靠性"
description: "比较确定性 Workflow 与开放式 Agent Loop 的运行边界，说明如何用固定阶段、有限决策点、工具契约、检查点和补偿把 Agent 安全接入企业流程。"
cover: /images/articles/workflow-before-autonomous-agent.svg
top_img: /images/articles/workflow-before-autonomous-agent.svg
permalink: /2024/06/07/workflow-before-autonomous-agent/
comments: false
editorial_standard: expert-v1
---

企业里讨论 Agent，常从“让模型自己规划并完成任务”开始。实际落地时，很多目标早已有明确步骤：查元数据、生成 SQL、跑验证、等待确认、发布结果。把这些步骤全部交给模型动态决定，会增加成本和不确定性，却没有增加业务价值。

我的默认选择是先做 Workflow。运行时控制阶段与状态，模型只出现在需要语言理解或候选判断的节点。只有任务路径确实无法预先枚举、并且工具与权限边界已经成熟，才开放有限 Agent loop。

![先把确定性骨架搭好，再开放 Agent 决策](/images/articles/workflow-before-autonomous-agent.svg)

<!-- more -->

## 先判断路径是否真的未知

“分析失败任务并给出修复建议”听起来像开放任务，拆开后通常有固定骨架：获取实例与日志、分类错误、读取作业配置/代码、收集引擎指标、形成假设、执行只读验证、输出证据。变化的是选哪些证据和如何解释，不是每一步都未知。

固定骨架适合 Workflow：阶段、输入输出 schema、超时、重试、权限和终态都能提前定义。模型在“错误分类”“候选证据选择”“建议生成”节点发挥作用，数据获取和执行由确定性工具完成。

真正适合 Agent loop 的是探索空间无法列全的子任务，例如在大型代码库中根据中间发现选择下一处源码，或研究多个可能来源。即便如此，loop 也受工具 allowlist、步数、成本、deadline 和检查点限制。

ReAct 把 reasoning 与 actions 交错，让模型能根据环境反馈继续行动。这种模式解释了开放式工具使用的价值，也提醒我们每个 action 都会改变后续轨迹。生产系统需要在外层提供状态和边界，不能只保存最终答案。

## Workflow 把失败位置变得清楚

一个自由 Agent 跑了十步后失败，可能是计划错、检索错、工具错、结果解析错或上下文累积错。固定 Workflow 每个节点有输入、输出和状态，失败可以定位到具体阶段并从 checkpoint 恢复。

节点状态不只 success/failed。工具异步执行会有 accepted/running，用户确认有 waiting/expired/rejected，模型流可能 incomplete，验证可能 needs_review。工作流引擎持久化这些状态，不靠对话文本推断。

重试按节点语义配置。纯检索可安全重试，创建工单需要 idempotency key，模型生成可以建立新 attempt，人工拒绝不能自动重试。把整个流程从头重跑，会重复已完成副作用。

补偿也是显式节点。发布配置后下游验证失败，回滚使用原版本与 operation ID；不是让模型阅读错误后临时想一个撤销命令。不可补偿动作放在最后，并要求更强确认。

## 有限决策点要输出结构化理由

模型节点不只返回选择，还返回候选、confidence、evidence refs 和 unresolved conditions。例如错误分类输出 `category=SCHEMA_MISMATCH`，同时引用日志行与 Catalog diff。confidence 低时 Workflow 走人工或补充证据分支。

分支集合由程序定义。模型可以在 `retry / inspect_schema / inspect_resources / escalate` 中选，不允许自己发明 `restart_cluster`。新增动作先注册工具、策略和测试，再进入选择集合。

决策理由用于审计和评测，但执行器不解析自然语言理由决定权限。真正的 branch value 是枚举，schema 与业务规则验证后才推进。

模型返回无效结构时，有限次数做格式修复；仍失败走明确 fallback。不能把同一 Prompt 无限重试直到偶然成功，成本和延迟都会失控。

## 检查点把“看起来完成”变成可验证完成

每个关键阶段定义 completion evidence。SQL 生成完成需要 parser/catalog/plan 通过；工具操作完成需要 operation status 与回读；RAG 答案完成需要核心 claims 有 evidence；文件修改完成需要 diff 与测试。

检查点优先用机器断言。行数、状态、schema、hash、退出码都能确定验证；业务口径或高风险影响再让人确认。所有事情都人工确认，Workflow 只是把工单换成聊天；所有事情都让模型判断，又回到不可靠自动化。

人工确认绑定 plan hash 与资源 version。等待期间 Workflow 持久化，不占模型连接；确认到达后从 checkpoint 恢复。超时进入 expired，不继续使用旧授权。

输出页面展示步骤状态和证据，让用户知道系统在哪一步、为什么停。只显示模型“正在思考”，既不能诊断，也无法建立合理等待预期。

## 从 Workflow 演进到 Agent 要有数据

先上线 Workflow 会积累真实轨迹：哪些节点经常需要新增分支，人工在哪些地方改选项，固定流程在哪些任务上绕路。只有这些证据能说明某段需要更多自主规划。

开放一个 Agent 子循环时，比较完成率、工具错误、人工接管、步数、成本和高风险失败。成功率提高但调用次数翻十倍，或偶尔越过对象边界，不值得换自由度。

Agent 输出仍回到 Workflow checkpoint。它可以探索并提交计划，执行生产动作仍走工具策略与确认。这样开放决策不会自动扩大执行权。

无法解释的长尾任务可以明确转人工，不必为了“全自动”让 Agent 猜到底。自动化覆盖率是结果，不是唯一目标；可靠地知道自己不能完成，同样是系统能力。

## 运行版本必须冻结

一次 Workflow run 固定 workflow definition、Prompt Bundle、tool registry、policy 和 model snapshot。运行一半发布新定义，不影响已经启动的实例；迁移必须显式并验证当前 checkpoint 兼容。

事件日志保存 node attempts、输入输出 artifact refs、决策、工具 operation 和最终状态。失败可以从 checkpoint fork 一次回放，不修改原历史。评测从真实轨迹中抽取，而不是只看最终文本。

企业 Agent 不需要一开始就证明模型能自己做完所有事。先把流程中确定的部分固化，把自由度放在真正需要判断的节点，再用工具、检查点和状态机守住边界，系统会更快进入可用状态，也更容易持续扩大能力。

## 参考论文与资料

- [ReAct：交错 Reasoning 与 Acting 的语言模型方法](https://arxiv.org/abs/2210.03629)
- [Plan-and-Solve Prompting：先规划再执行的推理方法](https://arxiv.org/abs/2305.04091)
- [OpenAI 2023 Function Calling：用结构化函数参数连接外部工具](https://openai.com/index/function-calling-and-other-api-updates/)
- [Apache Airflow 2.4.1 TaskInstance 状态模型](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/utils/state.py#L25-L71)
