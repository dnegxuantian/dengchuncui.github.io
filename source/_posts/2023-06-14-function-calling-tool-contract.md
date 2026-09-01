---
title: "Function Calling 上线后，模型到工具之间还缺一份执行契约"
date: "2023-06-14 13:52:26"
updated: "2023-06-14 13:52:26"
categories:
- "AI Agent 工程化"
tags:
- "Function Calling"
- "工具调用"
- "Agent"
description: "结合 OpenAI 2023 年 6 月发布的 Function Calling 与 JSON Schema，说明函数名、参数、权限、幂等、确认、错误和审计如何组成真正可执行的工具契约。"
cover: /images/articles/function-calling-tool-contract.svg
top_img: /images/articles/function-calling-tool-contract.svg
permalink: /2023/06/14/function-calling-tool-contract/
comments: false
editorial_standard: expert-v1
---

OpenAI 昨天发布 Function Calling 后，模型与外部工具之间终于有了比“在文本里吐一段 JSON”更明确的接口：开发者描述函数，模型可以选择函数并生成参数。这个能力会明显降低 Agent 工具接入成本，但它解决的是参数生成，不是安全执行。

我会把模型输出叫作 tool call proposal。它必须经过协议、业务、权限和风险检查，才会变成真实调用。少了这层执行契约，JSON 越稳定，错误动作反而越容易自动落地。

![Function Calling 到真实工具之间的执行契约](/images/articles/function-calling-tool-contract.svg)

<!-- more -->

## 函数描述不是服务端接口本身

Function Calling 用 JSON Schema 描述函数参数，模型返回函数名和 JSON arguments。这里最关键的一点是：模型没有执行函数，应用负责解释和调用。官方发布说明也把它描述为把模型能力连接到外部工具/API 的方式，并提醒真实世界动作要加入用户确认。

我不会直接用内部 RPC/SDK 方法生成 schema。面向模型的工具应是更窄的业务能力，例如：

```text
不暴露 executeSql(sql)，暴露 previewMetric(metric_id, filters)
不暴露 updateJob(raw_config)，暴露 changeJobOwner(job_id, new_owner)
不暴露 httpRequest(url, body)，暴露 getTicket(ticket_id)
```

窄接口让参数含义、权限对象和副作用可枚举，也减少模型利用通用工具绕过策略的空间。内部服务如何变化，由工具适配层消化，不让模型契约与底层接口一一绑定。

工具注册信息还要有 version、owner、risk_level、timeout、idempotency、required_permissions 和 result_schema。只有 name/description/parameters，执行器无法知道这个调用能否自动重试、是否需要确认、结果应如何验证。

## JSON Schema 通过不等于参数可用

schema 可以检查类型、必填字段、枚举、长度和格式，但很多业务约束依赖当前状态。`job_id` 符合字符串格式，不代表对象存在；`target_state=STOPPED` 合法，不代表任务当前允许停止；时间范围合法，也可能超过用户的数据权限。

我把校验拆成三层：

```text
结构校验：JSON 可解析，字段、类型、枚举和大小符合 schema
对象校验：ID 能解析到唯一对象，版本与环境匹配
策略校验：用户有权限，状态前置成立，风险与配额允许
```

对象参数优先使用稳定 ID，不让模型传 display name 后由执行器猜。同名任务、同名表在不同项目中非常常见。若用户只给名称，先调用 search/resolve 工具返回候选，再让用户或受控规则选择，不能直接进入变更工具。

未知字段默认拒绝。模型可能生成 schema 之外的 `force=true`，宽松反序列化若悄悄接收，就会把未来字段或拼写错误带入内部 API。工具契约要设置 `additionalProperties: false`，同时对字符串长度、数组数量和嵌套深度设上限。

## 权限以调用者和目标对象为准

工具服务使用自己的服务账户执行，不等于所有用户继承服务账户权限。每次调用携带可信的 user/tenant/session context，策略根据 action、resource、environment 和当前状态判断。模型生成的 `user_id` 不能覆盖真实调用者身份。

权限检查放在执行服务内部，而不只在 Agent 编排层。多个客户端都可能调用同一工具，最靠近资源的一层必须兜底。工具返回 `PERMISSION_DENIED` 时只给必要信息，不暴露“这个用户差哪个管理员角色”之类可被利用的内部细节。

读取型工具也有权限。搜索 Catalog、查看日志、列出工单可能泄露对象存在性。先过滤候选，再返回给模型；不能让模型看完完整数据后决定不说。

对高风险动作增加 approval token。预览接口根据规范化参数生成 plan hash，用户确认后签发短时 token；执行接口校验 token、user、resource version 和 plan hash。模型无法把对 A 的确认复用到 B，也不能在确认后悄悄改参数。

## 幂等与重试必须写进契约

模型调用、HTTP 请求和流式连接都可能重试。创建工单、发送通知、重跑任务如果没有幂等键，一次用户意图可能产生多个副作用。

幂等键由编排层基于 `run_id + tool_call_id` 生成，不由模型自由填写。工具服务保存 key、参数哈希和结果。相同 key、相同参数返回之前结果；相同 key、不同参数返回冲突。只有查询类和明确声明 retryable 的错误允许自动重试。

timeout 也不等于失败。客户端 30 秒没收到响应，服务端可能已经完成动作。执行器先用 idempotency key 查询状态，再决定重试。将所有超时交给模型“重新调用一次”，会制造最难排查的重复操作。

长任务返回 operation ID，而不是一直占着函数调用。后续用 `get_operation` 查询明确状态：accepted、running、succeeded、failed、cancelled。模型可以解释进度，不能把 accepted 写成已完成。

## 工具结果需要有限、稳定的错误语义

把 Java 堆栈、SQL 错误和下游 HTTP body 原样返回模型，会泄露内部路径、密钥片段和对象信息，也会让模型根据偶然文案采取不稳定动作。工具结果应有固定 envelope：

```json
{
  "status": "failed",
  "error_code": "STATE_CONFLICT",
  "message": "任务已进入结束状态",
  "retryable": false,
  "operation_id": "op_...",
  "evidence_ref": "audit_..."
}
```

错误码面向调用者语义，不直接复刻底层异常类。执行服务保留 cause chain，通过 evidence_ref 给运维人员查看。模型只基于 `retryable` 和允许的 recovery actions 决策，不能看到 timeout 字样就默认重试。

成功结果也要验证 schema。下游接口返回 HTTP 200 但缺关键字段，仍然是协议失败；创建任务返回 ID 后，可按风险选择回读确认。编排器分别记录 call accepted、execution succeeded 和 business state verified，不把它们压成一个 success。

## 一次调用必须能完整复盘

审计链从 user request 开始，包含模型与版本、工具定义版本、proposal、规范化参数、策略结果、确认记录、idempotency key、下游 request ID、原始/归一化结果和最终回答。敏感字段按 schema 标记后脱敏，不能靠日志平台事后正则猜。

评测用例不只看参数 JSON 是否匹配。要覆盖该拒绝时是否拒绝、歧义对象是否追问、权限失败是否停止、超时是否查状态、确认后参数是否保持、重复事件是否只执行一次。工具版本升级时，用固定 proposal 和模拟下游回放。

OpenAI 的发布说明同时提到模型版本可以 pin，并提醒模型升级可能在部分任务上退化。工具调用更需要固定 model snapshot、schema version 与评测结果。通用模型别名变化前，先跑自己的调用集，不把供应商平均指标当生产保证。

Function Calling 给了模型一套更可靠的表达方式。把它变成企业工具能力，还需要执行契约来守住身份、对象、权限、状态和副作用。模型可以提出下一步，真正改变系统状态的决定必须由确定性代码和可审计规则完成。

## 对照官方资料

- [OpenAI 2023-06-13 Function Calling 发布说明](https://openai.com/index/function-calling-and-other-api-updates/)
- [JSON Schema 2020-12 Core：schema、vocabulary 与实例验证基础](https://json-schema.org/draft/2020-12/json-schema-core)
- [JSON Schema 2020-12 Validation：类型、枚举、required 等校验关键字](https://json-schema.org/draft/2020-12/json-schema-validation)
- [OpenAPI 3.0.3：Operation、Parameter 与 Schema Object](https://spec.openapis.org/oas/v3.0.3)
