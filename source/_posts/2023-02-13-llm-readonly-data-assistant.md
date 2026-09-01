---
title: "让大模型查询企业数据，第一版为什么只能做只读助手"
date: "2023-02-13 11:26:08"
updated: "2023-02-13 11:26:08"
categories:
- "AI Agent 工程化"
tags:
- "数据助手"
- "数据库安全"
- "NL2SQL"
description: "从 PostgreSQL 15 的角色、只读事务、超时和 EXPLAIN 能力出发，设计一个不向模型暴露凭据、可限制对象与资源、全链路可审计的只读数据助手。"
cover: /images/articles/llm-readonly-data-assistant.svg
top_img: /images/articles/llm-readonly-data-assistant.svg
permalink: /2023/02/13/llm-readonly-data-assistant/
comments: false
editorial_standard: expert-v1
---

把大模型接进数据平台时，我不建议第一版就让它“自动完成数据操作”。企业数据查询本身已经包含权限、成本和口径风险；再开放 INSERT、DDL 或任务发布，错误会从一条答案扩散到真实系统状态。

第一版更合适的目标是只读数据助手：根据用户权限理解问题，生成候选查询，在受控环境执行，并把 SQL、结果依据和限制交给人复核。这里的“只读”不是 Prompt 里写一句“禁止修改”，而是从身份、解析、数据库权限到运行资源的多层约束。

![只读数据助手的执行隔离](/images/articles/llm-readonly-data-assistant.svg)

<!-- more -->

## 模型不应该持有数据库凭据

最省事的接法，是把数据库连接配置交给一个模型可直接调用的函数。问题在于模型输出不稳定，Prompt 又会混入用户内容。一旦工具参数允许原始 SQL，模型就等同拥有该账户的全部能力。

我会把模型与数据库之间放一个查询代理。模型只提交结构化候选：数据源、SQL、参数、问题上下文；代理从服务端凭据系统选择固定只读身份，做权限和资源检查后执行。模型输入、输出、日志都不包含密码、token 或 JDBC URL 中的秘密。

凭据按数据域和环境隔离。开发、测试和生产不用同一个账户；财务、用户行为和运维元数据也不共享一个“大查询账户”。用户能访问什么，由 `user -> policy -> data objects` 决定，模型只能在授权后的 schema 子集上生成。

代理日志记录 credential profile ID，不记录秘密本身。轮换密码时不改 Prompt 或模型配置，停用某个数据域也能在策略层立即生效。这一层隔离让模型供应方、对话存储和数据库访问权限不必绑在一起。

## SELECT 白名单要基于 AST

只检查 SQL 是否以 `SELECT` 开头很容易绕过。不同方言有 WITH、EXPLAIN、函数、副作用语句和多 statement；注释、大小写与字符串也会让正则判断失真。查询代理必须用目标引擎的 parser 得到 AST，只允许单条、明确的只读语句类型。

AST 检查至少覆盖：引用的 catalog/schema/table/column、函数白名单、子查询、外部表函数、系统表和可能产生副作用的扩展语法。`SELECT dangerous_function()` 在语法上仍是 SELECT，函数权限不受控时照样能修改状态或读取服务器文件。

对象检查不能只靠模型生成时提供的 schema。代理用当前 Catalog 重新解析引用，应用列级脱敏、行级过滤和租户边界。敏感列即使没有出现在 SELECT，也可能通过 WHERE、ORDER BY、聚合结果或错误信息形成旁路，需要在数据权限设计中统一处理。

参数尽量绑定，不让模型拼接用户原文。日期、枚举和数值先按 schema 校验，再作为 prepared parameters 进入查询。无法参数化的标识符必须从授权对象集合选择，拒绝任意字符串透传。

## 数据库权限是最终防线

应用层检查会有 bug，数据库账户本身必须没有写权限。PostgreSQL 的 GRANT 可以把表的 SELECT 权限授予只读角色；`default_transaction_read_only` 或事务级 `READ ONLY` 则阻止不符合只读事务的命令。二者配合，而不是二选一。

只读也不代表无害。复杂查询可以耗尽 CPU、内存、临时磁盘和连接，锁住系统目录，或拖慢生产库。我会优先接只读副本、查询引擎或数仓资源组，不让交互式助手直接打主库。每个 request 设置 statement timeout、连接超时、并发、扫描量和结果行数上限。

PostgreSQL 15 提供 `statement_timeout`，超过时间会中止语句。平台还应在网关层设置总 deadline，因为数据库取消请求、网络读取和结果序列化都可能继续耗时。用户取消回答时，也要把 cancel 传到真实 query ID，不能只关闭浏览器流。

EXPLAIN 在执行前提供计划证据。检测无分区过滤的大表扫描、笛卡尔积、广播风险或预计行数过大，先拒绝或转异步。`EXPLAIN ANALYZE` 会真实执行语句，不能当成无副作用的普通检查；这一点要在工具契约里写清楚。

## 返回结果也需要安全边界

限制查询行数不等于限制泄露。一行可以包含大文本、二进制或聚合后的敏感信息。结果层要限制列、单元格大小和总字节数，并应用掩码。模型通常只需要统计结果和少量样例，不应拿到完整明细再“自己总结”。

高基数字段有推断风险。用户反复改变过滤条件，可能通过 count 差分推断单个对象。对于人员、财务等敏感域，需要最小分组阈值、禁止某些维度组合，或只开放认证指标服务，而不是通用 SQL。

数据库错误也应净化。不存在的表名可以返回结构化 `OBJECT_NOT_ALLOWED`，但不要把完整 search path、服务器路径、内部 SQL 和堆栈交给模型。原始错误加密存入运维日志，通过 request ID 关联；用户侧只看到可行动的有限信息。

答案中标明结果截断、数据更新时间、时区、查询耗时与命中的权限策略。模型总结必须基于实际返回值，不能在执行失败后沿用先前候选继续作答。流式输出时，先完成查询与验证，再生成结论；不要先输出一句确定答案，后面才发现 SQL 失败。

## 审计要能还原一次查询

一次数据问答至少关联 user/session/request、模型版本、Prompt/semantic context version、候选 SQL、解析后的对象、策略版本、数据库 query ID、时间与资源指标、结果摘要和最终回答。敏感结果不一定长期保存，但摘要哈希和可复核引用要在合规范围内保留。

我特别关注“最终执行的 SQL”。模型候选经过代理重写行级过滤、自动 LIMIT 或方言转换后，二者可能不同。审计只存原候选，会让后续复现得出另一个结果。应同时保存 candidate、rewritten、parameter bindings 与 engine-normalized query。

对于拒绝执行的请求也要留原因。对象越权、计划过大、语句类型不允许、超时与解析失败分别统计，才能知道系统在保护什么。所有失败都叫“模型生成错误”，会掩盖 Catalog 不全、权限配置错和资源阈值不合理。

回归集来自真实审计，但要脱敏和固定数据快照。每次调整 Prompt、模型、parser 或 policy 后，重新验证允许查询仍能通过、危险查询仍被拒绝、同一问题的口径没有漂移。

## 从只读走向动作要逐项开放

只读助手稳定后，也不意味着直接给写权限。下一步可以先生成变更计划或草稿，让人确认后由确定性服务执行；再开放低风险、可逆且范围明确的动作。例如创建临时查询、保存个人视图，比删除分区或发布生产任务更适合自动化。

每个动作工具都需要窄参数、对象级授权、幂等键、预览、审批与回滚。模型负责选择工具和组织参数，执行系统负责验证状态前置条件。权限应按能力一项项增加，不能从“只读账户”直接跳到“管理员账户”。

第一版选择只读，是为了建立可扩展的执行底座，并非刻意保守。模型没有秘密，SQL 经过 AST 和 Catalog 校验，数据库角色兜底，资源与结果受限，审计能复现；这些能力以后同样会保护写操作。跳过它们，越早开放动作，越早把一次模型错误变成生产事故。

## 对照官方文档

- [PostgreSQL 15 `GRANT`：表、列与角色权限语义](https://www.postgresql.org/docs/15/sql-grant.html)
- [PostgreSQL 15：`default_transaction_read_only` 与会话默认事务模式](https://www.postgresql.org/docs/15/runtime-config-client.html#GUC-DEFAULT-TRANSACTION-READ-ONLY)
- [PostgreSQL 15：`statement_timeout` 的执行超时定义](https://www.postgresql.org/docs/15/runtime-config-client.html#GUC-STATEMENT-TIMEOUT)
- [PostgreSQL 15 `EXPLAIN`：计划检查与 ANALYZE 会真实执行语句的区别](https://www.postgresql.org/docs/15/sql-explain.html)
