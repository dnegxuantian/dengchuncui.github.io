---
title: "长任务为什么需要 Durable Execution：别把 Agent 状态押在一次 HTTP 连接上"
date: "2025-12-03 11:09:06"
updated: "2025-12-03 11:09:06"
categories:
- "AI Agent 工程化"
tags:
- "Durable Execution"
- "任务状态机"
- "故障恢复"
description: "从数据任务调度经验出发，拆解长时间 Agent 的事件历史、活动幂等、断点恢复、人工审批与版本兼容，避免断流后整条链路从头重跑。"
cover: /images/articles/agent-durable-execution.svg
top_img: /images/articles/agent-durable-execution.svg
permalink: /2025/12/03/agent-durable-execution/
comments: false
editorial_standard: expert-v1
---

把一个需要四十分钟的研究任务放在普通接口里跑，我最担心的不是模型慢，而是执行状态只活在进程内存里。网关超时、Pod 重启、SSE 断开，系统便不知道搜索做到哪一步、哪个工具已经产生副作用，只能从头再来。

数据调度系统早就处理过这类问题。长任务不能依赖一条不断开的连接，必须把一次执行表达成可恢复的状态机。Agent 场景多了模型输出和动态工具选择，基本原则没有变：决定要留下，副作用要有身份，恢复要从事实继续。

![Agent 持久执行与恢复路径](/images/articles/agent-durable-execution.svg)

<!-- more -->

## 先分清客户端会话和后台 Run

HTTP 请求负责提交任务，不负责承载任务的全部生命期。服务端接受请求后生成 `run_id`，固化输入、调用身份、工作流版本、权限快照和预算，再把 Run 放进持久队列。客户端可通过事件流观察，也可断线后凭 `run_id` 查询。

我会明确区分三种状态：连接状态、Run 状态和业务结果。浏览器显示“已断开”只说明传输断了；Worker 显示“完成”不代表产物通过验证；工具返回 200 也不代表业务副作用成功。把三者塞进一个 `status` 字段，恢复和告警都会误判。

Run 状态至少包括 `queued/running/waiting_approval/waiting_external/succeeded/failed/cancelled/unknown`。`unknown` 很重要：进程在确认工具结果前崩溃时，平台不能武断地标成失败，更不能立即重做有副作用的操作。

SSE 是观察通道，不是事实库。事件先进入持久历史，再投递给在线客户端；客户端带上最后确认的序号重连。若先推流、后落库，正好在两者之间崩溃，就会出现用户看见过、恢复后却不存在的幽灵步骤。

## Event History 保存决定，不保存进程快照

可恢复执行的核心是记录足以重放决策的事件：Run 创建、Step 调度、模型 Attempt 开始和结束、工具 Operation 提交和确认、审批决定、计时器触发、补偿结果。序列化整个 Python 或 Java 堆既脆弱，也解决不了外部副作用。

每条事件带单调序号、事件类型、时间、关联 step/attempt/operation、输入输出引用和校验摘要。大文件放对象存储，历史里存不可变引用；敏感字段按策略脱敏或加密，不能为了“可观测”把 token、密码和整份数据复制进日志。

重放不等于重新请求模型。模型具有非确定性，外部搜索结果也会变化。恢复时重建已经发生的状态，只对未完成的决定继续执行。若确实需要重算，生成新的 attempt，并保留它为什么替代旧 attempt 的关系。

工作流代码要尽量确定：相同历史得到相同下一状态。当前时间、随机数、配置读取和特性开关不能在重放时偷偷变化，要么形成事件，要么固定在 Run Bundle。否则代码升级后，同一份历史可能走出另一条分支。

## 工具副作用靠幂等键守住

恢复最危险的窗口是“工具已经执行，但完成事件还没写入”。发消息、提交工单、执行 DDL、触发数据任务都可能重复。平台必须为每个工具操作分配稳定的 `operation_id` 或 idempotency key，并贯穿 Agent、MCP 服务和业务系统。

工具端保存这个键与结果。重复请求若参数摘要相同，返回第一次结果；若键相同而参数不同，直接冲突。不能支持幂等键的系统，需要在调用前后用业务唯一键查询，并把结果分为 `confirmed/not_found/ambiguous`。`ambiguous` 进入人工核验，不能靠自动重试碰运气。

只读查询也不是无限重试。慢查询会占用资源，外部检索可能计费，读到的版本还可能不同。我会给 activity 配置最大 attempts、退避、超时和不可重试错误；参数校验失败、权限拒绝通常不靠相同参数重试解决。

补偿不等于数据库回滚。已经发出的通知无法真正撤销，可以再发更正；已经提交的任务可尝试取消，但可能早已开始。工作流应记录补偿语义和可逆等级，不要用一个万能 `rollback()` 掩盖现实。

## 审批等待不是占住一个线程

生产 Agent 经常在高风险步骤前等待人确认。等待可能持续几小时甚至几天，此时释放 Worker，把 `approval_requested` 写入历史。审批请求包含待执行对象、参数摘要、风险、权限依据、过期时间与计划版本；人的决定成为新事件，再唤醒执行。

恢复时必须重新检查容易变化的前置条件。审批通过的是“当时展示的操作”，不是一张永久通行证。如果目标资源版本、参数或权限发生变化，旧审批失效，重新生成 diff。否则用户批准删除 A，Agent 恢复后却按新计划删除 B。

定时等待和外部回调也一样。Timer 写入持久队列，回调以业务关联键落到 Run；重复、乱序和过期回调都要处理。靠 Worker `sleep()` 或内存 Promise 等待，在滚动发布后迟早丢状态。

取消采用协作式语义：Run 进入 cancelling，停止派发新 Step，对运行中的活动发送取消；已发生的副作用记录清楚。前端显示“已取消”之前，应知道哪些操作已确认、哪些仍在取消中，不能给用户一个虚假的瞬时终态。

## 版本升级要能重放旧历史

长任务跨过发布窗口很常见。新版代码若删除状态、改变分支条件或更换工具名称，旧历史可能无法继续。我会把 workflow version、prompt/tool schema、model snapshot 和 policy version 固化在 Bundle 中，并为状态迁移留显式版本标记。

发布前拿生产脱敏历史做 replay test：旧事件输入新版状态机，不能产生未记录的新决定，也不能卡在不存在的状态。需要改变行为时，用 version marker 让旧 Run 走旧分支，新 Run 走新分支，而不是在代码里猜历史时间。

活动接口也要兼容。工具升级后仍应接受旧 Operation 的恢复查询，或者提供迁移适配层。删掉旧模型、旧 prompt 并不只影响新请求，可能让一批等待审批的 Run 无法继续。

我判断 Durable Execution 是否做对，会做四个注入实验：模型返回后杀 Worker、工具提交后断网、审批等待中滚动升级、SSE 客户端反复重连。验收要同时满足没有重复副作用、历史顺序可解释、恢复点正确、终态只有一次，不能停在“最终好像成功”。

长任务的可靠性最终来自可持久的事实，而不是更长的超时。连接可以断，进程可以换，代码可以升级；只要决定、操作身份和版本边界都留下，Agent 才能在真实环境里继续走完。

## 对照资料

- [Temporal：Durable Execution 的工作方式](https://docs.temporal.io/temporal)
- [AWS Builders' Library：Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [OpenTelemetry Trace API：Span、Event、Status 的语义](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [OpenAI Responses API：后台执行与状态查询](https://platform.openai.com/docs/guides/background)
