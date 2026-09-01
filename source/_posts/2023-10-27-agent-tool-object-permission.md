---
title: "Agent 工具权限不能停在“允许调用”：动作、对象和状态要一起判断"
date: "2023-10-27 15:27:19"
updated: "2023-10-27 15:27:19"
categories:
- "AI Agent 工程化"
tags:
- "Agent 安全"
- "工具权限"
- "授权"
description: "把 Agent 工具调用的权限拆成可信主体、具体动作、稳定对象、运行上下文和资源当前状态，并用对象解析、确认令牌、工具内鉴权与审计避免越权。"
cover: /images/articles/agent-tool-object-permission.svg
top_img: /images/articles/agent-tool-object-permission.svg
permalink: /2023/10/27/agent-tool-object-permission/
comments: false
editorial_standard: expert-v1
---

给 Agent 配一份“可用工具列表”，只能说明模型可以看到哪些函数，不能说明用户有权对哪些对象做什么。一个用户能调用 `rerun_job`，不代表他能重跑所有项目、所有环境的任务；能调用 `query_table`，也不代表能读每张表的每个字段。

我把工具权限表达为 `subject × action × resource × context`。主体来自可信会话，动作来自已注册工具，对象必须解析为稳定 ID，上下文包含租户、环境、时间和资源当前状态。模型只提出参数，不参与最终授权结论。

![Agent 工具权限落到动作与对象](/images/articles/agent-tool-object-permission.svg)

<!-- more -->

## 工具可见性只是第一层收敛

根据用户角色只向模型暴露必要工具，能减少误选和 Prompt 注入后的攻击面。只读用户看不到 delete、publish、send 等工具，模型就少了一条危险路径。但隐藏 schema 不是安全边界，攻击者仍可能直接调用后端接口。

每个工具服务必须再次鉴权。调用携带由网关签名的 subject context，包括 user ID、tenant、session、auth time 和 delegation scope。模型生成的 arguments 中即使有 `user_id=admin`，也不能改变主体。

服务账户只代表 Agent runtime，不代表最终用户。后端策略同时检查 caller service 和 delegated user：服务是否允许调用此 API，用户是否允许执行此 action。任何一层不通过都拒绝，并记录 policy decision ID。

工具注册表标明风险等级和权限动作，例如 `job:read`、`job:rerun`、`job:stop`。不要把同一个 `job:write` 粗权限覆盖所有操作。停止运行实例与修改调度配置的风险和 owner 范围并不相同。

## 对象名称必须先解析成唯一身份

用户说“重跑订单同步”，系统可能找到测试与生产两个同名任务。模型根据上下文猜生产对象，再通过权限检查，也可能因为用户恰好有两边权限而执行错误目标。

动作工具只接受 immutable resource ID 和 expected version。名称、别名、路径先交给只读 resolve 工具，返回候选的项目、环境、owner 与状态。只有一个高置信候选且策略允许时才能继续；否则把歧义展示给用户。

对象解析也受权限过滤。不能先返回全公司同名任务，再让用户选，因为候选列表本身可能泄露项目。resolve 服务在当前 subject scope 内搜索，响应说明是否因无权而隐藏细节时要谨慎，不暴露对象是否存在。

层级对象要处理继承。用户有项目权限，不一定自动拥有生产环境变更权；表级 SELECT 也不能推出关联存储路径访问权。策略显式编码继承和 deny precedence，不让模型根据组织常识推断。

## 当前状态是授权条件的一部分

同一个动作在不同状态下风险不同。重跑一个已失败的离线实例可能允许自助；重跑仍在运行的实例会产生并发写；停止核心日结任务可能需要值班审批。

策略判定读取资源 current version/state，并把它写入 decision。执行时工具用 compare-and-set 再检查 expected version，防止授权后对象发生变化。预览时任务是 FAILED，真正执行前已被其他人重跑到 RUNNING，就应返回 `STATE_CONFLICT`，不能沿用旧授权。

时间和环境也进入 context。生产发布只在变更窗口内允许，紧急窗口需要 incident ID；跨地域数据查询受 data residency 约束。模型不负责判断“现在是否紧急”，它只能传递由外部系统确认的工单或审批引用。

策略结果给出 allow/deny、reason code、obligations 与 expiry。obligations 可能是二次确认、脱敏、限行或审批。执行器必须落实这些义务，不能只读取 allow 布尔值。

## 用户确认需要绑定计划

高风险工具先返回 dry-run plan：将对哪个资源、哪个版本、执行什么动作、影响哪些下游、预计资源和可回滚方式。用户确认后，系统签发包含 subject、action、resource ID、expected version、normalized arguments hash 和 expiry 的 approval token。

执行接口校验 token 与当前调用完全一致。用户确认“重跑 2023-10-26”后，模型不能把日期换成一个月；确认测试环境后，也不能复用 token 到生产。任何参数变化都重新预览和确认。

确认文本要来自确定性 plan，不由模型自由总结。模型可以解释，但 UI 的关键字段直接渲染结构化数据。否则模型漏掉“会覆盖分区”这类影响，用户的点击不能算知情确认。

低风险、可逆、无副作用查询可以免确认；风险等级由工具 owner 与安全策略确定，不让 Prompt 自己判断。频繁确认会让用户麻木，因此工具粒度和默认安全参数要先设计好。

## 工具输出也在权限边界内

执行成功后返回的日志、对象详情和错误可能包含敏感信息。权限不是入口检查一次就结束。工具按 subject 过滤 result，模型只看到用户有权查看的字段。

错误码要避免对象枚举。无权访问与对象不存在可以对普通用户返回相同外部结果，原始原因只进安全审计。日志链接使用短期、绑定主体的访问凭证，不能返回一个所有人可打开的对象存储 URL。

Agent 的对话记忆也不能跨权限沿用。用户权限被撤销后，旧会话中曾检索的敏感片段不应继续进入下一轮。每次 run 构建上下文时按当前 policy version 复核引用，或让安全域变化直接关闭旧会话。

缓存 key 包含 subject scope 与 policy version。只按 tool name + arguments 缓存，会把管理员查询结果返回给普通用户。共享缓存只保存不含敏感数据的公开结果，并由工具明确声明。

## 审计记录为什么允许，而不只记录做了什么

一次工具调用的审计要串起 user request、模型 proposal、resource resolution、policy input/output、approval、tool execution 和 result。只有最终 API 日志，无法回答系统为何选择这个对象、谁的权限被使用、用户确认了哪份计划。

拒绝也进入统计。大量 OBJECT_AMBIGUOUS 说明命名/检索需要改善；STATE_CONFLICT 说明预览到执行窗口太长；PERMISSION_DENIED 可能是用户越权，也可能是授权模型与组织流程不一致。把这些都叫模型失败，会修错方向。

安全回归集覆盖 Prompt 注入、伪造 user ID、越权对象 ID、确认后换参、旧 approval token、资源版本变化、工具直接绕过网关和结果字段泄露。每次策略、schema、模型或工具版本更新都重跑。

OpenAI 在 Function Calling 发布说明中已经提醒，来自不可信工具的数据可能诱导模型执行非预期动作，真实世界动作应增加用户确认。企业 Agent 还要再向下走一步：确认只能证明用户接受了计划，权限系统仍要证明他有权执行。

## 对照规范与资料

- [OpenAI 2023 Function Calling：工具输出注入风险与真实动作确认建议](https://openai.com/index/function-calling-and-other-api-updates/)
- [NIST RBAC：基于角色的访问控制模型与标准背景](https://csrc.nist.gov/projects/role-based-access-control)
- [NIST SP 800-162：Attribute Based Access Control 定义与考虑](https://csrc.nist.gov/publications/detail/sp/800-162/final)
- [OWASP Authorization Cheat Sheet：deny by default、每次请求校验权限](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
