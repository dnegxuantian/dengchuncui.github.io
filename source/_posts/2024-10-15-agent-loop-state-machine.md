---
title: "Agent Loop 不能靠 while true：状态、等待与副作用要可恢复"
date: "2024-10-15 10:06:37"
updated: "2024-10-15 10:06:37"
categories:
- "AI Agent 工程化"
tags:
- "Agent Loop"
- "状态机"
- "持久化执行"
description: "把 Agent 循环建模为 READY、MODEL_RUNNING、VALIDATING、TOOL_RUNNING、WAITING_USER 和 FINALIZING 等持久化状态，处理恢复、幂等、终止和事件乱序。"
cover: /images/articles/agent-loop-state-machine.svg
top_img: /images/articles/agent-loop-state-machine.svg
permalink: /2024/10/15/agent-loop-state-machine/
comments: false
editorial_standard: expert-v1
---

最小 Agent loop 往往是一段 `while true`：调用模型，看到 tool call 就执行并把结果放回消息，看到 final answer 就结束。Demo 里足够，生产中只要进程重启、用户确认等十分钟、工具超时但实际成功，内存里的循环就无法给出正确恢复。

我会把 loop 做成持久化状态机。每次模型 attempt、工具 operation、用户等待和最终化都有独立状态，迁移先写事件和 artifact，再推进 current state。重启后从最后一个已提交状态恢复，不从对话文本猜执行到哪里。

![Agent Loop 的可恢复状态机](/images/articles/agent-loop-state-machine.svg)

<!-- more -->

## READY 构建的是一次确定输入

READY 阶段冻结本轮输入：conversation state、memory snapshot、retrieval evidence、tool registry、policy、model route 和剩余 budget。产出 context artifact hash，然后才进入 MODEL_RUNNING。

如果构建上下文时一边读取不断变化的 memory/index，一次 retry 可能看到不同事实。新 attempt 默认复用同一 context artifact；明确允许刷新知识时生成新的 step，并记录变化。

step 有单调编号，attempt 是 step 内模型调用次数。run/step/attempt 三层身份进入 trace。模型流断开重试不会把已完成工具结果重复插入，也不会把两次生成混成一个 assistant message。

deadline、max_steps、token/cost/tool-call budgets 在 READY 检查。耗尽进入明确终态，不再让模型“最后再试一次”。预算是运行时约束，不靠 Prompt 提醒。

## MODEL_RUNNING 与 VALIDATING 必须分开

模型返回 final text 或 tool proposal 前，流可能 incomplete、truncated、blocked。MODEL_RUNNING 只负责收集原生/统一事件并形成 candidate artifact；看到可信 finish 才进入 VALIDATING。

VALIDATING 检查结构、tool name/schema、对象、权限、引用和输出规则。candidate 不合法时，根据错误类型有限修复、追问或失败。不能在流还没结束时看到半个 function arguments 就启动工具。

模型输出 final answer 也不直接 success。先检查核心 claims/evidence、敏感内容和任务 completion condition，再进入 FINALIZING。一个“已经完成”的自然语言句子不能替代工具状态。

每个 validation decision 保存 version 和 evidence。Prompt/validator 更新后可对原 candidate 回放，无需再调用模型。

## TOOL_RUNNING 围绕 Operation，而不是 HTTP 调用

通过验证的 tool proposal 创建 operation，带 idempotency key、canonical arguments、expected resource version 和 policy decision。HTTP 请求 timeout 后状态是 UNKNOWN/PENDING_RECONCILIATION，不立刻创建新 operation。

恢复时先按 operation ID/idempotency key 查询。后端已成功就记录结果并回到 READY；确认未执行才安全重投；无法确认则暂停或人工，不让两个 attempt 同时改资源。

工具 accepted/running/succeeded/failed 与 Agent node 状态分开。长任务返回 accepted，Agent 可以 WAIT_TOOL 或释放 worker，由回调/轮询事件唤醒。不能占一个模型连接等几个小时。

工具结果写成不可变 artifact，下一 READY 通过引用加入上下文。大日志不整段塞入，先用确定规则提取摘要与关键证据，原始内容保留 evidence ref。

## WAITING_USER 是可持久化状态

需要澄清或确认时，状态机生成 question/plan artifact、expected response schema、expiry 和 resume token。进程退出、服务发布都不影响等待。

用户回复后验证 run/state/version/token。过期确认、重复提交或 plan 已变化都拒绝；有效事件只消费一次。模型生成的新一轮问题不能复用上一轮 approval。

WAITING_USER 不占并发执行槽，但计入业务 SLA。Dashboard 区分系统处理时间与用户等待时间。超时后进入 EXPIRED/CANCELLED，执行必要清理。

用户发来完全不同的新目标时，是继续当前 Run 还是新 Run，由产品协议明确。不能把它随手追加到旧 loop，让已确认的工具计划与新意图混在一起。

## FINALIZING 负责唯一终态

FINALIZING 汇总模型结果、工具 operations、evidence、usage、成本和 warnings，检查 completion invariants。只有所有必要副作用已验证、核心答案可支持，Run 才 SUCCEEDED。

模型正常结束但工具仍 running，Run 是 WAITING_TOOL，不是 success；工具成功但最终文本断流，可生成新 summarization attempt，不重做工具；用户取消但后端无法确认停止，状态是 CANCEL_UNKNOWN。

终态只追加一次，使用 compare-and-set 防两个 worker 同时 finalize。迟到事件保留在历史，但不能覆盖终态；若确需更正，通过 resolution/reopen 事件建立新版本。

最终响应与持久化原子关联。客户端收到 success 前，结果 artifact 和终态已经提交；发送失败可以重读，不重新运行整个 loop。

## 循环检测不仅看步数

固定 max_steps 能兜底，还要识别重复模式：连续相同 tool + argument hash、同一错误码反复出现、上下文没有新增 evidence、计划在两个状态间来回。触发后停止并给出 loop diagnosis。

工具错误定义 recovery actions。PERMISSION_DENIED 不重试，OBJECT_AMBIGUOUS 追问，RATE_LIMIT 受总 deadline 退避，STATE_CONFLICT 刷新对象后重新计划。把所有错误交给模型，会产生无意义循环。

每一步要求 progress marker，例如新增 evidence、完成 operation 或缩小候选。没有进展的连续步骤超过阈值，转人工或失败。progress 由运行时事实计算，不让模型自报“有进展”。

ReAct 展示了推理与动作交错的能力；生产 Agent 的外层仍需要像调度系统一样明确状态、重试和终态。自由规划可以留在 MODEL_RUNNING，持久化、权限和副作用必须由状态机接管。

Agent Loop 从 while true 升级为可恢复状态机后，重启、等待、超时和迟到事件都有确定位置。系统才有能力解释执行到哪、下一步为何发生，并保证同一个真实动作不会因为模型或网络重试被做两次。

## 对照论文与源码

- [ReAct：Reasoning 与 Actions 交错的 Agent 模式](https://arxiv.org/abs/2210.03629)
- [Apache Airflow 2.4.1：TaskInstance 与 DagRun 状态枚举](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/utils/state.py#L25-L71)
- [OpenTelemetry Trace：Span events、links 与 status](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [JSON Schema 2020-12 Validation：状态输入输出的结构契约](https://json-schema.org/draft/2020-12/json-schema-validation)
