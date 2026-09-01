---
title: "AI 生成 SQL 上生产前，我会放四道闸门"
date: "2024-04-26 11:19:07"
updated: "2024-04-26 11:19:07"
categories:
- "AI Agent 工程化"
tags:
- "AI SQL"
- "SQL 安全"
- "数据平台"
description: "把 AI SQL 的上线边界拆成语句、数据、资源和语义四道闸门，用真实 Parser、权限、EXPLAIN、只读执行与业务断言阻止可执行但错误的查询。"
cover: /images/articles/ai-sql-four-guardrails.svg
top_img: /images/articles/ai-sql-four-guardrails.svg
permalink: /2024/04/26/ai-sql-four-guardrails/
comments: false
editorial_standard: expert-v1
---

AI 写 SQL 已经不难，难的是决定哪条 SQL 可以进入生产查询链路。只做语法检查，会放过越权与全表扫描；只做权限，会放过指标口径错误；让用户自己审核，又很难在一键分析和 Agent 自动执行中保持一致。

我会设置四道独立闸门：语句、数据、资源、语义。它们分别回答“能不能解析”“能不能看这些数据”“能不能以这个代价运行”“是否真的回答了问题”。四层结论和证据一起返回，不用一个笼统的 safe/unsafe 盖掉差异。

![AI SQL 的四道闸门](/images/articles/ai-sql-four-guardrails.svg)

<!-- more -->

## 第一道：语句闸门限制能做什么

候选 SQL 先交给目标引擎版本的 parser，得到 AST。只允许单条查询、受控 EXPLAIN 或明确开放的语句类型；DDL、DML、事务控制、外部命令和多 statement 默认拒绝。

规则作用在 AST，不用正则找关键词。WITH 可以包裹 INSERT，SELECT 可以调用有副作用的函数，注释和字符串也会干扰文本匹配。函数、table function、UDF、hint 和动态 SQL 都要按方言白名单。

引擎版本是输入。同一语法在 Spark、Flink、Hive、PostgreSQL 以及不同版本中含义不同。平台无法调用真实 parser 时只能标 `UNVERIFIED_DIALECT`，不能拿通用 parser 的成功当生产许可。

解析后生成 canonical SQL/hash，原始候选也保存。后续自动补全 qualified name、行级过滤或 LIMIT 时，每次重写都重新 parse，并记录 rewrite diff。

## 第二道：数据闸门限制能看到什么

从 AST 提取 catalog/schema/table/column/function，按真实用户身份做对象与列权限检查。模型运行账户不能把服务权限借给用户。对象名先解析稳定 ID，再做策略判断，防止 search path 和同名对象造成误选。

行级策略由数据库或查询代理注入，不让模型自己添加 `tenant_id`。查询的子查询、CTE、view 展开后都要在权限范围内；只检查最外层 SELECT 列表会漏掉 WHERE、ORDER BY 与聚合中的敏感字段。

结果也过一遍数据策略。大文本、明细行、极小分组和敏感统计可能需要掩码或最小聚合阈值。错误信息去掉内部对象、路径和堆栈，给模型有限 error code。

权限版本写入 query trace。用户权限撤销后，旧会话不能继续复用之前的 schema/context；缓存 key 也包含 subject scope 与 policy version。

## 第三道：资源闸门限制能花多少

通过权限的只读 SQL 仍可能拖垮集群。先执行 EXPLAIN，提取扫描分区、estimated rows/bytes、Join、Exchange、排序、状态和无法下推的谓词。规则按引擎与工作负载区分。

`LIMIT 100` 不等于扫描少。过滤不能下推、Join 后再 limit 时，底层仍会读取大量数据。资源闸门看计划，不只看 SQL 文本。

允许执行的查询进入隔离资源组或只读副本，设置 statement timeout、scan limit、memory、并发、结果 rows/bytes 与总 deadline。用户取消时把 cancel 传给真实 engine query ID，不能只停前端。

估算依赖统计信息。stats 过期或缺失时，资源结论标不确定并采用更保守阈值。高风险大查询转异步任务，先展示预计范围与成本，让用户确认。

## 第四道：语义闸门检查是否答对

前三道通过只能说明 SQL 可安全执行，不能说明业务正确。`COUNT(*)`、`COUNT(DISTINCT user_id)`、按创建时间还是支付时间，都会给出合法结果。

用户问题先结构化为 metric、dimensions、time range、grain、filters 和 qualifiers。SQL AST/plan 反向映射这些要素，检查目标粒度、Join 基数、去重键、时间字段与默认过滤。缺关键口径就追问，不能由模型补成默认答案。

常用指标引用认证 definition ID/version。生成 SQL 与认证表达式做结构化比较，或在固定快照与基准 SQL 对照。结果断言检查唯一性、非负、枚举、总分关系、空值和容差。

没有认证定义时也能执行探索查询，但答案标“临时分析”，返回 SQL、对象版本、数据时间和限制。模型总结不得把探索结果称为官方指标。

## 四道闸门各自有失败语义

响应不只给“验证失败”，而是：`SYNTAX_UNSUPPORTED`、`OBJECT_NOT_ALLOWED`、`PLAN_TOO_EXPENSIVE`、`METRIC_AMBIGUOUS` 等稳定代码。每个代码带可行动信息和 evidence ref，原始引擎错误只在运维审计中查看。

修复策略也不同。语法错可以在限制次数内让模型改写；权限失败立即停止，不提示如何绕过；资源过大让用户缩小范围或异步；语义歧义应追问。统一让模型“根据错误再试一次”，会把权限探测和资源消耗变成循环。

Run 状态记录每道闸门 input/version/outcome。自动重写后从第一道重新开始，不能只重跑失败那层，因为 AST 和对象集合可能改变。

监控分别统计四层拒绝率与误放案例。SQL 最终被人工纠正时，标注是哪道闸门应发现却没发现，进入对应回归集。

## 写操作不能靠多加一个确认框

四道闸门为只读查询建立底座，不自动授权 INSERT、UPDATE、DROP。写操作还需要 change plan、影响范围、审批、幂等、版本检查、事务/补偿和回滚证据。

即使用户确认，也要按目标对象当前版本再鉴权。确认只证明用户看过计划，不证明计划安全。生产变更更适合让模型生成草案，由已有发布系统执行，而不是让 SQL Agent 直接持有管理员连接。

AI SQL 的工程边界不是把模型包在数据库外面就完成。语句、数据、资源、语义四道闸门各自独立，才能说明一条 SQL 为何被允许，也能在错的时候知道该修哪一层。

## 对照官方资料

- [PostgreSQL 15 `EXPLAIN`：计划与 ANALYZE 的执行语义](https://www.postgresql.org/docs/15/sql-explain.html)
- [PostgreSQL 15 `GRANT`：对象与列权限](https://www.postgresql.org/docs/15/sql-grant.html)
- [Apache Spark 3.3.1 SQL `EXPLAIN`：逻辑与物理计划](https://github.com/apache/spark/blob/fbbcf9434ac070dd4ced4fb9efe32899c6db12a9/docs/sql-ref-syntax-qry-explain.md)
- [Apache Flink 1.15.3 SQL `EXPLAIN`：执行计划与细节](https://github.com/apache/flink/blob/c41c8e5cfab683da8135d6c822693ef851d6e2b7/docs/content/docs/dev/table/sql/explain.md)
