---
title: "Responses API 统一了模型与工具，但企业执行边界仍要自己守"
date: "2025-03-18 16:29:14"
updated: "2025-03-18 16:29:14"
categories:
- "AI Agent 工程化"
tags:
- "Responses API"
- "Agent 运行时"
- "工具执行"
description: "基于 OpenAI 2025-03-11 发布的 Responses API，区分供应商管理的模型/内置工具事件与企业 function 执行，设计身份、策略、operation 和最终验证边界。"
cover: /images/articles/responses-api-execution-boundary.svg
top_img: /images/articles/responses-api-execution-boundary.svg
permalink: /2025/03/18/responses-api-execution-boundary/
comments: false
editorial_standard: expert-v1
---

OpenAI 3 月 11 日发布 Responses API，把 Chat Completions 的简洁接口与工具使用能力放进新的 API primitive，并提供 web search、file search、computer use 等内置工具。统一 item 结构和流式事件会减少很多自建编排代码。

但供应商帮我们统一模型与内置工具，不等于企业内部动作也能直接托管。用户身份、对象权限、生产状态、审批、幂等和回滚仍属于企业执行域。我会把 provider response 和 business operation 分成两套身份与状态，再在 Run 最终化阶段汇合。

![Responses API 接入后的两层执行边界](/images/articles/responses-api-execution-boundary.svg)

<!-- more -->

## Response 不是企业 Run 的唯一身份

一次用户 Run 可能调用多个 Responses，遇到网络/模型失败还会产生 attempts；一个 Response 内也可能包含多个 output items 和内置工具步骤。企业 run_id 是最外层身份，response_id/provider request ID 作为 attempts/artifacts 关联。

反过来，不能只存 run_id 丢掉 response_id。供应商侧排障、usage、stored response 和流事件都要用原生身份查。trace 建立 `run -> response attempt -> output item/tool event` 层级。

Run 固定用户、租户、Bundle、policy、deadline 和数据分类。请求发送前记录哪些数据将进入供应商、是否允许 store、保留策略和实际模型 snapshot。API 提供存储能力不代表所有业务默认开启。

重试创建新 response attempt，但 enterprise tool operations 不跟着重建。下一 attempt 复用已验证工具结果或查询 operation state，防止模型重试造成重复动作。

## Built-in Tool 与 Function Tool 风险不同

web/file search、computer use 等内置工具由供应商协议管理，function call 则通常需要应用执行企业工具。两类都要观测，但授权和责任不同。

内置 web search 涉及查询文本出域、来源可信度和引用；file search 涉及 vector store/文件 ACL 与保留；computer use 会产生 UI 操作和真实副作用。官方发布说明也把 computer use 标为 research preview，并建议人类监督。企业不能因为它叫 built-in 就跳过风险评估。

Function output item 只是一份 proposal。应用校验 function name、arguments、对象、权限、状态与确认，执行后得到 business operation ID，再把有限结果交回模型。

每个 tool type 在 capability registry 声明 execution_owner：provider 或 enterprise。Run finalizer 才知道去哪查终态、谁负责取消、如何对账成本和副作用。

## Item 流需要按协议归并

Responses API 的 item-based design 比纯文本更适合表达多种输出，但客户端仍不能假设每个流事件都是完整 item。adapter 保存原生 event type、sequence/IDs 与 payload，再转成统一事件。

text delta、item created/completed、tool call、usage、response completed/failed 等有明确状态关系。只有 response 终态与所有必要 item 完整，attempt 才 completed；HTTP 200 或连接 EOF 不够。

未知 event type 不丢弃，标 protocol drift 并保留 native。SDK 提供 `output_text` 之类 helper 很方便，审计和工具运行时仍要读结构化 output items，不能只取拼接文本。

流中 function arguments 未完成前不执行。终态后再做 JSON/schema validation，生成 tool_call_id 与 enterprise operation 的映射。工具结果回填也带对应 call ID，不能靠数组位置对齐。

## 企业执行网关保持原边界

网关收到 function proposal 后，先 resolve stable resource ID，按真实 user subject 调 policy，必要时生成 preview/approval，再用 idempotency key 创建 operation。模型和供应商都不拿生产凭据。

工具后端再次鉴权，并检查 expected resource version。供应商侧 conversation state 只能保存对话/工具结果，不替代企业 operation database；哪次动作是否已执行，以后者为准。

超时后不把错误字符串直接交模型重试。先查询 operation：已成功返回现有 result，确认未执行才重投，未知则等待/人工。provider response 重试与 business operation 重试是两个策略。

结果只返回模型需要的 fields、status、error code 和 evidence ref。内部堆栈、凭据、完整日志不进入 provider context，数据最小化在工具层落实。

## 最终成功要合并两层证据

Response completed 可能生成了漂亮答案，但企业 operation 仍 running；operation succeeded，最终 response 又可能断流。Run 状态必须同时检查任务 completion criteria。

例如“重跑失败任务并告诉我结果”：至少需要模型选择正确实例、policy/confirmation 通过、rerun operation 业务验证成功、最终答案引用新实例 ID/status。少一项都不应显示 complete。

内置 search 报告还需 claim-citation 验证；computer use 要从目标系统回读状态，不能只相信截图或模型说“已点击”。provider tool success 与 business effect 分开。

finalization 保存 response items、enterprise operations、evidence、usage 和 warnings。客户端发送失败时可重读最终 artifact，不重跑模型与工具。

## 网关适配要保留退出路径

Responses API 是新的推荐 primitive，但业务层不应直接依赖供应商 item 类型完成授权和状态。内部定义 provider-neutral Run/Attempt/Tool Proposal/Operation/Evidence，adapter 负责映射。

不是为了最低公分母。Responses 独有能力保留 native extension，capability matrix 显式声明；业务使用前绑定 provider feature，并准备缺失时的失败/降级，不假装所有模型相同。

迁移先影子运行：同一输入在旧 Chat Completions/现有编排与 Responses adapter 下比较文本、tool path、finish、usage、流式事件和错误。固定工具 mocks，确认协议转换后再接真实 operation。

官方接口简化了模型侧编排，企业运行时应因此变薄，但不应消失。谁授权、谁执行、谁确认最终业务状态，是跨供应商都要保留的边界。把 Response 与 Operation 分开建模，才能既使用新 API 的工具能力，又不把生产控制权交给模型协议。

## 对照官方资料与规范

- [OpenAI 2025-03-11：New tools for building agents 与 Responses API](https://openai.com/index/new-tools-for-building-agents/)
- [OpenAI Responses API Reference](https://platform.openai.com/docs/api-reference/responses)
- [MCP 2024-11-05 Specification：工具协议不替代用户授权与控制](https://modelcontextprotocol.io/specification/2024-11-05)
- [W3C Trace Context：跨供应商与企业服务关联一次 Run](https://www.w3.org/TR/trace-context/)
