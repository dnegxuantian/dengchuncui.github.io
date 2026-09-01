---
title: "数据平台 Agent 的终点为什么是可验证执行：会回答还远远不够"
date: "2026-08-20 21:50:45"
updated: "2026-08-20 21:50:45"
categories:
- "AI Agent 工程化"
tags:
- "数据平台 Agent"
- "可验证执行"
- "智能运维"
description: "从元数据理解、对象解析、计划验证、权限审批、幂等执行、运行观测和业务验收设计数据平台 Agent，把自然语言意图闭环为可核验结果。"
cover: /images/articles/data-platform-agent-verifiable-execution.svg
top_img: /images/articles/data-platform-agent-verifiable-execution.svg
permalink: /2026/08/20/data-platform-agent-verifiable-execution/
comments: false
editorial_standard: expert-v1
---

数据平台里做一个“能回答任务为什么失败”的 Agent 不难：接入日志、元数据和模型，常见错误能说得像模像样。真正困难的是用户继续说“那你帮我修一下并重跑”，系统还能保持对象正确、权限清楚、执行幂等，并证明数据结果已经恢复。

我认为数据平台 Agent 的终点不是更自然的问答，而是可验证执行。自然语言意图要经过对象解析、证据诊断、变更计划、权限决定、受控操作和结果验收，最终每一步都能回到真实系统核对。

![数据平台 Agent 可验证执行闭环](/images/articles/data-platform-agent-verifiable-execution.svg)

<!-- more -->

## 数据上下文先解决“它说的是谁”

用户说“订单同步任务”“昨天失败的表”“生产上的客户宽表”，这些都不是稳定对象。Agent 先从目录、调度和资产系统解析 tenant、environment、project、job/table ID、version 与业务日期，返回候选和依据。

同名对象、多环境和别名必须显式处理。候选唯一且风险低可以继续；多个候选需要用户选择；生产写操作即使名称唯一，也应展示规范化对象。不能因为 embedding 最相似就默认命中。

元数据不是一次性 prompt 文本。对象 schema、owner、血缘、分区、权限、代码版本和运行状态有各自来源与时间。Context Bundle 保存查询时间、版本和引用，后续计划变化时能判断哪些事实已过期。

Agent 还要知道缺什么。没有表唯一键就不能保证某类去重改写等价，没有完整日志就不能确认根因，没有任务实例 ID 就不能重跑。把信息缺口说出来，比补一个听起来合理的默认值更专业。

## 诊断从运行证据形成可证伪假设

任务失败时先关联实例、调度状态、代码、参数、资源、执行引擎日志、SQL plan 和上下游状态。把异常栈中的直接错误与平台转换后的提示分开，保留原始时间窗和版本。

一个 OOM 可能来自数据倾斜、状态无界、并发提高、容器 limit 下降或同节点干扰。Agent 给出假设时要列支持证据、反证和下一步检查。只有在控制变量对照后，才把某一项升级为确认原因。

历史相似案例用于提示检查方向，不能代替当前现场。同样的错误文本在不同引擎版本和任务阶段可能含义不同。检索结果带来源、时间、适用版本，最终判断依赖当前 Run 证据。

对 SQL 或配置修改，先生成 diff 与影响分析：输入输出 schema、分区/过滤、NULL 与重复语义、资源估算、血缘下游。能做 EXPLAIN、测试分区和样本对照时先做，不用“语法通过”冒充等价验证。

## Plan 是可审批的执行契约

Agent 把建议转成结构化 Plan：目标对象与版本、前置条件、步骤、工具参数、预期变化、风险、回滚/补偿、验证查询和停止条件。每个步骤区分只读、可逆写、不可逆写及外部通知。

审批看到的是规范化 diff，不是自然语言摘要。重跑任务要显示实例、业务日期、依赖策略与是否清理旧产物；改 SQL 要显示精确版本差异；补数据要显示时间范围、并发、输出表和预计资源。

审批绑定 Plan hash、对象 version 和 policy decision。审批后若 Agent 修改参数、对象状态已变化或权限过期，重新校验或审批。不能把“用户同意修复”当整场会话的无限授权。

Plan 可模拟：执行权限检查、资源配额、依赖冲突、SQL plan、安全规则和预期影响，但清楚标明哪些只是静态判断。模拟通过不代表运行一定成功，只减少已知错误。

## 工具层把自然语言收窄成领域动作

数据平台 MCP/工具不应只暴露万能 SQL 和 shell。更安全的接口是 `get_job_instance`、`fetch_log_window`、`explain_job`、`rerun_instance`、`create_backfill`、`get_table_schema`、`submit_job_version`，参数使用稳定 ID 与显式环境。

读写分离，查询工具返回 source/version；写工具要求 idempotency key、expected version 和 decision ID。重复提交同一逻辑操作返回已有结果，版本冲突让 Agent重新读取，而不是强制覆盖。

长任务采用 durable operation。提交补数据返回 operation ID，Agent轮询或接收事件；连接断开后继续查同一个操作。状态未知先向调度平台 reconciliation，不再发起第二批相同实例。

工具结果需要领域语义。`accepted` 只表示调度系统收到了请求，`running` 表示实例启动，`succeeded` 仍需数据验收。统一成一个 success 布尔值，会让 Agent 在最关键的边界上提前结束。

## 验证分运行态、数据态和业务态

修改发布成功后，先验证配置和代码版本已生效；实例运行层看依赖、资源、进度、重试和终态；数据层核对分区、行数、主键重复、空值、关键聚合和输入输出差异；业务层确认下游消费与口径恢复。

每类任务有 verification contract。重跑不是“实例变绿”就结束：要确认正确业务日期、没有重复产出、下游是否需要触发。SQL 优化不是“耗时下降”就结束：结果集合在明确约束下等价，资源和长尾稳定。

验证查询和阈值在 Plan 阶段确定，避免结果出来后挑有利指标。大表无法全量对照时，使用分区聚合、hash、抽样和独立指标，并说明验证范围。高风险变更先 canary 一个分区或小时间窗。

若验证失败，系统保留修改、运行和结果证据，按预设补偿或停止。不要让 Agent为了达到“成功”自动降低阈值、改验收 SQL 或反复重跑。

## 每次执行都是评测样本

Trace 把用户意图、对象解析、context versions、诊断 claims、Plan、审批、工具 Operations 和 verification results 串起来。敏感数据用受控引用，仍要能复现关键决定。

线上评测不只看回答满意度。我关心 object resolution accuracy、evidence-backed diagnosis、unauthorized attempt、duplicate operation、verified success、human correction、recovery time 和 unknown outcome。一个回答很漂亮但重跑错日期，结果应是失败。

人工纠正进入有结构的失败库：对象错、证据不足、计划越界、参数错、工具状态误读、验证漏项。它们生成回归用例，固定工具 fixture 与权限环境后重放。模型、prompt、Skill、工具 schema 任何一层升级都要过同一批边界样本。

执行证据还能反哺平台。大量 Agent 都在手工拼同一类日志，说明平台缺统一诊断 API；频繁因同名任务停下，说明元数据标识和搜索要改；验证总靠临时 SQL，说明数据质量契约应产品化。

数据平台为 Agent 提供元数据、运行状态、工具和权限，Agent 则把这些能力组织成用户可理解的工作流。两者结合的价值，不是给旧页面加一个聊天框，而是让一次自然语言请求最终落成有对象、有证据、有边界、可回归验证的执行闭环。

## 对照资料

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [OpenLineage Object Model：Run、Job 与 Dataset](https://openlineage.io/docs/spec/object-model/)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Google SRE Workbook：Implementing SLOs](https://sre.google/workbook/implementing-slos/)
