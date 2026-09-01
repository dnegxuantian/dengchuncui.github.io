---
title: "企业 Agent 工具接口怎么设计：别把内部 API 原样暴露给模型"
date: "2024-11-20 11:47:58"
updated: "2024-11-20 11:47:58"
categories:
- "AI Agent 工程化"
tags:
- "Agent 工具"
- "接口设计"
- "企业集成"
description: "用 Discover、Preview、Execute、Observe 与 Verify/Compensate 设计企业 Agent 工具接口，收窄参数与副作用，解决对象歧义、幂等、异步状态和错误语义。"
cover: /images/articles/enterprise-agent-tool-interface.svg
top_img: /images/articles/enterprise-agent-tool-interface.svg
permalink: /2024/11/20/enterprise-agent-tool-interface/
comments: false
editorial_standard: expert-v1
---

企业系统通常已经有大量 REST/RPC API，把 OpenAPI 文档转成 function schemas，看起来就能让 Agent 使用。问题是内部 API 是为确定性程序和后台页面设计的：参数宽、状态隐含、错误复杂，调用方默认知道对象 ID 和业务前置条件。模型不具备这些默认知识。

我会在现有 API 外增加 Agent Tool Facade。接口围绕用户目标和安全闭环设计，而不是一一映射 Controller 方法。典型动作拆成 Discover/Resolve、Preview、Execute、Observe、Verify/Compensate。

![企业工具接口的 Preview-Execute-Observe 闭环](/images/articles/enterprise-agent-tool-interface.svg)

<!-- more -->

## 工具按业务动作收窄

内部接口 `POST /jobs/action` 接受 actionType、config、force、skipChecks 等几十个字段，对 Agent 太宽。更合适的工具是 `rerun_failed_job_instance`、`stop_running_instance`、`get_job_logs`，每个动作有固定风险和参数。

窄工具减少模型选择空间，也让权限落到具体 action。重跑与停止不是同一个 `job:write`；查看摘要日志与下载完整日志也可以分权限。

参数使用稳定 resource ID、明确 date-time、enum 和有限数组。自由文本只用于 reason/comment，不参与对象定位和权限。`additionalProperties: false`，字符串、列表和时间范围都有上限。

description 说明何时使用、不适用条件和结果含义，但关键规则仍由代码验证。不能依赖“只在任务失败时调用”一句描述，工具服务要读取实例当前状态。

## Discover 与 Resolve 不和 Execute 混在一起

用户通常说名称，动作需要 ID。让 execute 工具同时按模糊名称搜索并执行，遇到同名对象只能猜。先用 discover 返回权限过滤后的候选，再 resolve 到唯一对象。

候选包含 display name、project、environment、owner、state 和 immutable ID/version。低置信或多个候选时由用户确认；后续 preview/execute 只接受选定 ID。

列表支持 pagination/cursor 与 query limit。Agent 不应该为了找一个任务把全公司对象拉进上下文。搜索结果返回 match reasons，模型可以解释为何需要确认。

对象不存在与无权访问的外部错误按安全策略合并，避免枚举。内部审计保留真实原因和 policy decision。

## Preview 生成确定计划

有副作用的工具先 preview。服务端规范化参数、读取 current state、计算影响范围、依赖、资源成本、风险与回滚方式，返回 plan ID/hash、expected resource version 和 expiry。

计划内容结构化，UI 直接渲染目标与影响。模型可以补充说明，但确认基于原始 plan。若补数会覆盖 31 个分区、重跑会触发 12 个下游，不能靠模型总结是否提到。

preview 本身只读、可重试，但仍需权限。它可能暴露对象、依赖和成本。用户确认 token 绑定 subject、action、plan hash 和 expiry，参数或状态变化重新 preview。

低风险查询可不需要 preview，但所有变更工具保持一致模式，Agent runtime 无需为每个后端发明确认逻辑。

## Execute 返回 Operation，不等待所有事情结束

执行请求携带 plan/approval 与 idempotency key。服务端先落 operation 记录，再提交真实动作，立即返回 operation ID 与 accepted 状态。长任务不占模型连接，也不让 HTTP timeout 表示业务失败。

相同 key、相同参数返回原 operation；相同 key、不同参数冲突。调用超时后 Agent 先 `get_operation`，确认不存在再重试。idempotency 由工具实现兜底，不只靠网关缓存。

operation 状态至少 accepted/running/succeeded/failed/cancel_requested/cancelled/unknown。progress 有 sequence 和 observed time；重复/乱序回调幂等归并。

取消是独立动作，也要返回 operation。用户点停止不等于后端立刻终止；只有执行系统确认，状态才 cancelled。unknown 进入对账，不能显示绿色“已停止”。

## Observe 返回有限证据

状态接口给机器读的 code、progress、result summary、error code、retryable、evidence refs 和 next allowed actions。不要让 Agent 从一大段日志文本猜操作是否成功。

错误映射稳定：PERMISSION_DENIED、STATE_CONFLICT、RATE_LIMITED、VALIDATION_FAILED、DOWNSTREAM_UNAVAILABLE。底层堆栈和内部 URL 不进入模型，运维通过 evidence ref 查看。

progress 事件与最终结果可订阅或轮询，但一次 operation 只有一个单调状态历史。网络断开后从 operation ID 恢复，不创建新执行。

结果按用户权限过滤。日志、受影响对象和输出文件链接都使用短期授权，不能因为工具调用成功就扩大结果访问。

## Verify 与 Compensate 让闭环完整

API 返回 succeeded 可能只表示请求已写库。对关键动作做业务回读：任务实例是否生成、目标分区是否发布、配置版本是否真的切换。verification outcome 与 execution outcome 分开记录。

失败后补偿不是执行原操作的反函数字符串。工具定义明确 compensatable、compensation tool/plan、所需旧版本和窗口。不可补偿动作在 preview 标出，并提高确认等级。

Agent 可以建议补偿，真正执行仍走 preview/authorize/execute。不能因为上一工具失败，就自动获得修复权限。

整个链路用 run ID、tool call ID、plan ID、operation ID 和 evidence refs 关联。评测覆盖超时后已成功、重复请求、状态变化、确认过期、部分成功和补偿失败，不只测 200 happy path。

Agent Tool Facade 不是多包一层 JSON，而是把企业 API 隐含的身份、状态和副作用变成显式契约。模型负责表达用户意图，工具负责让每个动作可预览、可授权、可查询、可验证，二者的责任才清楚。

## 对照规范与资料

- [OpenAPI 3.0.3：Operation、Request Body、Responses 与 Schema](https://spec.openapis.org/oas/v3.0.3)
- [JSON Schema 2020-12 Validation：输入输出结构约束](https://json-schema.org/draft/2020-12/json-schema-validation)
- [OpenAI 2023 Function Calling：模型生成函数名与 JSON 参数](https://openai.com/index/function-calling-and-other-api-updates/)
- [RFC 9110：HTTP 方法、状态与幂等语义](https://www.rfc-editor.org/rfc/rfc9110)
