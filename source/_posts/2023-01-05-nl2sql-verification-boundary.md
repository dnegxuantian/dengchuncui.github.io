---
title: "NL2SQL 可以生成查询，但不能替你定义正确：一条 SQL 的验证边界"
date: "2023-01-05 09:47:31"
updated: "2023-01-05 09:47:31"
categories:
- "AI Agent 工程化"
tags:
- "NL2SQL"
- "SQL 验证"
- "数据语义"
description: "从 Spider、Execution-Guided Decoding 与 PICARD 的方法出发，拆解企业 NL2SQL 从语法生成到对象、计划、执行和结果语义验证的完整边界。"
cover: /images/articles/nl2sql-verification-boundary.svg
top_img: /images/articles/nl2sql-verification-boundary.svg
permalink: /2023/01/05/nl2sql-verification-boundary/
comments: false
editorial_standard: expert-v1
---

NL2SQL 演示很容易做出效果：准备几张表，把 schema 放进上下文，模型很快能生成一条能跑的 SQL。真正接到企业数据平台后，问题不再是“有没有 SQL”，而是这条 SQL 为什么可信。字段名写对、语法能执行，只通过了最浅的一层检查。

我把 NL2SQL 的交付物定义为“可验证查询”，不是一段字符串。除了 SQL，还要带上所用口径、对象版本、权限范围、执行计划风险和结果断言。模型负责提出候选，平台负责决定它是否有资格执行和回答。

![NL2SQL 的验证边界](/images/articles/nl2sql-verification-boundary.svg)

<!-- more -->

## 语法正确只排除了最低级错误

Spider 把 text-to-SQL 推进到跨领域、多表和复杂查询场景，也让问题更清楚：模型需要在未见过的数据库上理解 schema 与问题。PICARD 则在解码过程中拒绝不符合 SQL 语法和 schema 约束的 token，让生成结果保持可解析。

这些方法很重要，但工程上要理解其边界。下面两条 SQL 都能解析，也可能执行成功：

```sql
SELECT COUNT(*) FROM orders WHERE pay_time >= '2023-01-01';
SELECT COUNT(DISTINCT user_id) FROM orders WHERE create_time >= '2023-01-01';
```

用户问“今年新增付费用户数”时，哪一条都可能不对。需要先定义“新增”“付费”“用户”和时间口径：首次支付还是当年支付，退款是否剔除，业务时区是什么，订单与用户快照取哪个版本。Parser 无法从 SQL 结构里推导这些业务事实。

因此第一道边界不是 SQL 生成，而是问题规范化。平台把自然语言拆成指标、维度、时间范围、粒度、过滤条件和待确认项。关键口径缺失时，让系统追问或拒答，比猜一个看似合理的字段更专业。

## Schema Link 不能只给表名和列名

模型知道 `order_id` 和 `user_id`，并不等于知道它们如何关联。企业表里常有同名字段、拉链表、软删除、分区列、技术主键和业务主键。DDL 只提供类型，真正决定查询的还有约束与数据约定。

我会给 NL2SQL 构建一个最小授权语义包：

```text
可访问的表与列
主外键或经过验证的 Join 路径
字段业务说明、枚举和单位
分区与快照规则
指标定义及默认过滤条件
已知的一对多关系与去重键
```

上下文按问题召回，而不是把整个 Catalog 塞进去。表太多时，同名字段和无关关系会增加误选；表太少时，模型又会用现有字段硬凑答案。召回结果要带 object ID 与 metadata version，生成 SQL 后再反查，避免模型引用已删除或无权访问的对象。

Join 是最需要显式验证的地方。事实表连接退款明细、标签明细或多值维表时，行数可能倍增。系统至少检查 Join key 是否在允许关系中、左右基数是什么、聚合发生在 Join 前还是后。不能因为 SQL 有 `COUNT(DISTINCT ...)` 就认为重复已经被正确处理。

## Execution-Guided 也只能证明“这次能跑”

Execution-Guided Decoding 会执行候选 SQL，利用运行错误或空结果筛掉一部分错误查询。工程实践里也常用 `LIMIT 1` 试跑。这能发现不存在的列、类型不匹配和部分运行时错误，却不能证明全量执行安全，更不能证明答案语义正确。

小样本执行可能绕过大分区、倾斜 key 或昂贵 Join。`LIMIT` 放在逻辑计划末端时，底层仍可能扫描全表。查询先经过 EXPLAIN，检查扫描分区、Join 类型、笛卡尔积、预计数据量、函数下推和资源代价。超过阈值就返回计划风险，让用户缩小范围或转异步任务。

实际执行放在只读账户与隔离队列中，设置 statement timeout、扫描量、并发和结果行数上限。模型没有数据库凭据，只能把候选提交给查询代理。即便检查器漏判，数据库权限和资源隔离仍是最后防线。

执行失败也不把原始数据库错误完整回填给模型。错误里可能包含对象名、路径、SQL 片段或敏感配置。平台把错误归类为 schema、permission、syntax、resource、timeout 等有限类型，保留 request ID 供人工诊断，再决定是否允许模型修正一次。

## 结果验证需要业务断言

一条 SQL 返回 42，不代表“42”回答了问题。系统应检查结果形状：用户问趋势，结果是否包含时间维度；问占比，分母是否非零、各项是否大致闭合；问唯一用户，查询是否在正确粒度去重；问环比，两个周期是否同长且时区一致。

我会为常用指标保存轻量断言：非负、取值范围、唯一键、枚举、总分关系、与基准口径的容差。第一次生成的 SQL 可以与人工认证查询在固定样本上做对照。差异不是直接让模型“再想想”，而是展示分区、Join 后行数和中间聚合，让问题落到可检查的环节。

空结果要单独处理。它可能表示业务确实为零，也可能是日期字段、时区、权限过滤或 Join 路径错了。平台可以执行一组便宜的探针：目标分区是否存在、过滤前是否有数据、关键维度是否命中。只有证据支持时，才把空集合解释为零。

最终答案同时返回 SQL、数据源/快照时间、口径说明和限制。用户能打开查询复核，而不是只看到模型组织的一段自然语言。对于高风险指标，答案标成候选分析，不冒充认证报表。

## 评测要按错误层分桶

只统计 exact match 或执行成功率，无法指导平台改进。SQL 文本不同可能语义等价；能够执行的 SQL 也可能在 Join、时间或指标定义上错得很远。

我会把离线用例按至少五类标注：schema linking、Join path、filter/time、aggregation/grain、execution safety。每条失败记录模型上下文、候选 SQL、验证器结论和人工正确查询。上线后再加入真实问题的拒答率、追问率、执行失败率和人工纠错率。

回归环境必须固定数据库快照与 Catalog 版本。数据变化后结果值不同，不等于模型退化；schema 或统计信息变化后计划不同，也不能继续拿旧阈值比较。评测用例要同时固定 question、semantic context、engine version 和 expected invariants。

NL2SQL 的价值，是降低表达查询意图的门槛，不是跳过数据建模与验证。把模型放在候选生成位置，把正确性拆成可检查的层，系统才能在“答得快”和“答得可信”之间建立真正的工程边界。

## 参考论文与文档

- [Spider：面向复杂跨领域 text-to-SQL 的数据集与评测](https://arxiv.org/abs/1809.08887)
- [Execution-Guided Decoding：用执行结果约束语义解析候选](https://arxiv.org/abs/1807.03100)
- [PICARD：在解码过程中增量约束可解析 SQL](https://arxiv.org/abs/2109.05093)
- [PostgreSQL 15 `EXPLAIN`：查看查询计划而不默认执行语句](https://www.postgresql.org/docs/15/sql-explain.html)
