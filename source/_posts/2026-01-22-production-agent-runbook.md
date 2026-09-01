---
title: "生产 Agent 需要怎样的故障运行手册：先按症状止损，再沿证据定位"
date: "2026-01-22 20:15:14"
updated: "2026-01-22 20:15:14"
categories:
- "AI Agent 工程化"
tags:
- "Runbook"
- "故障诊断"
- "可观测性"
description: "给生产 Agent 建立可执行的故障运行手册：按用户症状分流，定义止损动作、证据查询、恢复门槛和升级路径，避免靠重启与重试掩盖问题。"
cover: /images/articles/production-agent-runbook.svg
top_img: /images/articles/production-agent-runbook.svg
permalink: /2026/01/22/production-agent-runbook/
comments: false
editorial_standard: expert-v1
---

传统服务报错，值班同学通常先看接口、实例和依赖。Agent 出问题时，表面症状更混乱：用户说“一直转圈”，可能是模型仍在生成、工具卡住、SSE 丢了终态，也可能任务已经完成但结果没有持久化。

运行手册不能按团队组件来写成“模型篇、向量库篇、MCP 篇”。值班者首先拿到的是用户症状和一个时间点。我更愿意从结果状态出发，先确认影响与副作用，再沿 Run 的证据链定位归属。

![生产 Agent 故障运行手册分流](/images/articles/production-agent-runbook.svg)

<!-- more -->

## 第一页只放十分钟内要做的事

Runbook 开头不是系统架构，而是一份现场检查单：受影响租户与任务类型、首次发生时间、错误比例、是否仍有写操作在运行、近期发布和策略变更、已知安全影响。没有这些事实，直接重启只会销毁现场。

先取得 `run_id/request_id/trace_id` 中至少一个。如果用户只提供页面和时间，用租户、会话与时间窗口反查，但必须把检索范围写清楚。截图中的一句错误不能代替服务端事件；一个 HTTP 200 也不能证明流式响应完整。

我会把症状分成五类：没有开始、执行中无进展、输出中断、结果错误、产生错误副作用。前四类仍要看风险，第五类立即冻结相关写工具或切换只读策略，保存 operation/decision/approval 证据，再讨论恢复。

止损动作要预先分级：关闭某个高风险 tool version、把路由切回已验证模型、暂停新 Run、限制单租户流量、保留查询但禁止执行。不要只给一个“关闭 Agent”总开关，也不要让值班人员现场猜配置键。

## 沿 Run、Step、Attempt、Operation 查

Run 是用户任务，Step 是计划中的工作单元，Attempt 是一次模型或活动尝试，Operation 是外部副作用。运行手册给出四层的查询入口和判定字段，而不是让人跨十个系统手工拼时间线。

Run 层看 bundle/version、deadline、budget、terminal state 与最终产物；Step 看依赖、调度与等待原因；Attempt 看模型请求、流事件、finish、usage 与重试；Operation 看规范化参数、idempotency key、权限决定和真实业务结果。

“卡住”要有可计算定义。比如 `last_progress_at` 超过任务桶阈值、无活动 Worker lease、仍有未决审批、外部异步任务未回调。不同原因对应不同动作：等待审批不该重试模型，Worker 丢 lease 可安全重新领取，业务状态不明则先 reconciliation。

“断流”检查完整事件序列：是否有 response created、内容增量、tool call arguments complete、tool result、message/output done 和 terminal event。代理层 499、网关超时、客户端取消、provider 终止要分开。只查应用日志里最后一行，容易把客户端断开误认为模型失败。

## 每个操作都写清安全恢复条件

Runbook 中的命令必须标注只读、可逆或有副作用，并写前置检查和成功信号。例如“重放流事件”是只读；“重试模型 attempt”会产生费用但通常无业务副作用；“重试工具 operation”可能重复发消息或改数据，必须先查幂等结果。

我不接受“重启后观察”这种恢复步骤。重启哪个组件、为什么能解除什么状态、会丢失哪些内存信息、如何确认积压下降，都要写。若问题来自 schema 不兼容，扩容与重启只会更快地产生失败。

补偿动作同样要具体。错误提交任务后，是停止尚未运行的实例、取消运行中实例、还是对已写数据回滚；每种状态由谁确认，何时允许恢复入口流量。补偿失败不能覆盖原始失败，应产生关联 Operation。

恢复门槛采用用户结果：新 canary Run 通过、终态完整、工具业务结果一致、错误率回到基线、积压可消化，并持续一个明确观察窗口。单个 Pod Ready 或接口 200 只是组件信号。

## 常见症状要有固定的证据表

“回答明显错误”先固定输入 Bundle、检索 chunks、工具原始结果、模型原始输出与最终转换。若工具事实正确而答案错，看生成与引用；若工具选错对象，看实体解析和目录；若页面错而持久化结果正确，看流式转换与前端组装。

“重复执行”查 operation idempotency key、attempt 边界、超时窗口和消费者 offset。没有新 Operation ID 的重复可能是下游未幂等；产生多个 ID 则多半是编排层把一次逻辑步骤当成多次新操作。

“权限异常”同时查主体委托链、资源对象、参数、policy snapshot、decision reason、审批绑定与工具端授权。Agent 层说 allowed、业务端 403，可能是 token audience、身份映射或对象级权限，而不是简单的“权限缓存”。

“成本暴涨”按成功与失败路径拆 attempts、重复上下文、检索、工具、沙箱与人工接管。总 token 上升只是现象；如果根因是 SSE 终态丢失造成全量重跑，先修协议而不是强行缩短回答。

## Runbook 也要参加发布和演练

手册与代码放同一仓库，标 owner、适用版本、最后演练时间和依赖仪表盘。接口、字段或配置变化时，发布检查要求同步更新。链接失效和命令过期，应当像测试失败一样暴露。

每月用故障注入演练一两个路径：模型超时、MCP 返回非法 schema、Worker 在副作用后崩溃、SSE 丢 terminal、权限服务不可用。让非作者值班并记录卡点，才能发现手册里默认了多少隐性知识。

事故结束后，Runbook 不只新增一条错误码。要提炼最早可观察信号、最小止损范围、缺失证据、无效操作与可自动化诊断。重复出现且判定稳定的步骤进入平台，留给人的应该是需要判断的分叉。

一份好运行手册不会假装 Agent 故障都能一键修复。它让现场先知道发生了什么、哪些动作安全、什么时候可以恢复，以及证据不足时该停在哪里。这比“多重试几次”可靠得多。

## 对照资料

- [Google SRE Workbook：Incident Response](https://sre.google/workbook/incident-response/)
- [Google SRE Book：Effective Troubleshooting](https://sre.google/sre-book/effective-troubleshooting/)
- [OpenTelemetry Logs：Trace 与 Log 的关联](https://opentelemetry.io/docs/specs/otel/logs/)
- [AWS Builders' Library：Avoiding insurmountable queue backlogs](https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/)
