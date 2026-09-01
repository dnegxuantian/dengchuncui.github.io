---
title: "SQL Copilot 生成之后怎么验：Parser、Catalog、Planner 缺一层都不够"
date: "2023-08-06 14:11:38"
updated: "2023-08-06 14:11:38"
categories:
- "AI Agent 工程化"
tags:
- "SQL Copilot"
- "SQL 验证"
- "查询引擎"
description: "从 Flink SQL 1.15.3、Spark SQL 3.3.1 与 PostgreSQL 15 的解析和 EXPLAIN 能力出发，设计 SQL Copilot 面向真实引擎的三段验证与回归闭环。"
cover: /images/articles/sql-copilot-engine-validation.svg
top_img: /images/articles/sql-copilot-engine-validation.svg
permalink: /2023/08/06/sql-copilot-engine-validation/
comments: false
editorial_standard: expert-v1
---

SQL Copilot 最容易做成“代码补全器”：模型返回 SQL，编辑器高亮一下，用户自己运行。到了需要自动修复、自动解释或一键执行的场景，这个边界就不够了。模型写出的 SQL 往往像标准 SQL，真正交给 Flink、Spark、Hive 或 PostgreSQL 时，方言、Catalog 和执行计划都会给出不同结论。

我把验证分成三段：目标引擎 Parser 证明语句属于这个方言，Catalog/Analyzer 证明对象和类型能解析，Planner/受控执行证明计划风险和结果语义可接受。任何一段失败，都返回具体证据，而不是笼统说“SQL 可能有问题”。

![SQL Copilot 的三段验证](/images/articles/sql-copilot-engine-validation.svg)

<!-- more -->

## 通用 Parser 不能替代目标引擎

同一个 `MERGE`、窗口函数、日期表达式或引号规则，在不同引擎和版本里支持程度不同。用一个通用 SQL parser 检查通过，只能证明它符合该 parser 的语法，不代表目标集群能执行。

验证请求必须绑定 `engine_type + engine_version + dialect_config`。平台调用与线上相同版本的 parser，或调用目标引擎提供的 parse/prepare 接口。无法精确匹配版本时要标出限制，不能用最新 parser 给旧集群签发“语法正确”。

Parser 阶段还负责限制语句形态：只允许单 statement、禁止未授权 DDL/DML、识别注释与多语句分隔、提取 AST 中的表、列、函数和 hint。正则搜索 `DROP` 或判断 SQL 以 SELECT 开头，处理不了 CTE、嵌套查询和方言扩展。

Flink SQL 的 EXPLAIN 输入最终由自身 parser/planner 处理，Spark SQL 也有独立 parser 与 logical plan。SQL Copilot 若声称支持多个引擎，应该把这些真实解析链路作为适配器，而不是让模型在 Prompt 里“注意方言”。

## Catalog/Analyzer 才知道对象是否成立

语法正确的 `SELECT amount FROM orders` 仍可能引用不存在的列、错误 database、不可见的临时 view，或把 STRING 与 TIMESTAMP 比较。Analyzer 需要当前 Catalog、search path、函数注册和会话配置才能解析。

上下文中给模型的 schema 是生成依据，执行前检查用的 Catalog 才是事实。两者版本不一致时，返回 `METADATA_STALE`，附模型使用版本与当前版本。不要看到字段不存在就让模型无限重写，因为问题可能是缓存陈旧，而不是生成能力。

对象解析结果保存稳定 ID 和完全限定名。同名表在不同 catalog/schema 下不能依赖默认 search path；生产和测试的默认库也不应共用。最终 SQL 可由平台补全限定名，但原候选与重写结果都进入审计。

类型检查要关注隐式转换。引擎允许 STRING 到数字的宽松转换，不代表业务上安全；日期格式错误可能变 null 而不是报错。关键字段建立 stricter rules，例如时间范围必须显式时区，金额不允许浮点隐式比较，分区字段必须有可下推谓词。

## EXPLAIN 是风险检查，不是正确性证明

Planner 能发现全表扫描、笛卡尔积、Join 顺序、Exchange、广播、状态保留和无法下推的过滤。它适合阻止明显危险查询，也能给 SQL 优化建议提供证据。

Flink 的 EXPLAIN 会展示 AST、optimized physical plan 和 execution plan，不同 detail 还能输出 changelog mode、estimated cost 等信息。Spark 的 `EXPLAIN` 可以输出 parsed/analyzed/optimized logical plan 与 physical plan。平台应保存原始 plan 和解析后的关键特征，不能只让模型读一大段文本自行判断。

风险规则按引擎区分。批任务关注 scanned partitions、shuffle、Join build side 和小文件；流任务还要检查无界 Join、state TTL、changelog 兼容和 sink 语义。把“没有全表扫描”当统一安全标准，会漏掉流作业无限状态增长。

EXPLAIN 依赖统计信息。estimated rows 不准时，规则只能给风险提示，不能伪装成精确成本。报告要区分 planner fact、统计估算和平台推断。

## 受控执行补上数据语义

Parser、Analyzer、Planner 全通过，SQL 仍可能在业务粒度上错。退款明细一对多导致金额翻倍，时间字段选错导致少一天，`COUNT(*)` 与 `COUNT(DISTINCT user_id)` 都不会触发语法或计划错误。

受控执行使用固定快照或隔离样本，设置只读、超时、资源组与结果限制。验证中间行数：每次 Join 前后 cardinality、聚合前后粒度、过滤命中分区和关键 null ratio。对认证指标，与基准 SQL 在同一快照做差异比较。

`LIMIT 100` 只限制结果，不必然限制扫描。小样本最好来自确定性分区或采样表，并记录它覆盖了哪些数据特征。随机抽样每次不同，会让回归结果漂移；只抽头部数据，又可能错过 null、倾斜和边界日期。

结果断言不是写死一个数。可以断言唯一键、非负、枚举范围、分项与总量关系、两个实现差异在容差内。真实值随快照变化，但这些不变量仍能发现结构性错误。

## 修复建议要带证据和验证状态

SQL Copilot 说“增加分区过滤可以提升性能”没有行动价值。建议应指出哪个 scan 未命中 partition pruning、当前扫描多少分区、可用分区列是什么，并给出修改前后 plan diff。

自动改写后重新走完整三段验证。只看新 SQL 能解析，可能为了修复一个函数又引入对象或语义变化。输出区分 `generated`、`parsed`、`analyzed`、`planned`、`executed`、`asserted`，用户一眼知道验证到了哪层。

不能执行时也要诚实。生产库无只读沙箱，系统最多验证到 plan；统计信息缺失，成本只是推断；没有认证口径，结果语义需人工确认。比一个笼统的“已优化”更能建立信任。

日志记录模型输入的 schema version、候选 SQL、目标引擎版本、每层错误、最终改写与 plan hash。用户接受/拒绝建议进入回归集，按 parser、catalog、plan、semantic 分类，不把所有失败都归到模型。

SQL Copilot 真正有价值的地方，不是比人更快写出几十行 SQL，而是把目标引擎已有的解析、元数据和计划能力接进生成闭环。模型提出候选，引擎提供事实，验证器给出边界，最终交付才是一条可以负责的查询。

## 对照官方资料

- [Apache Flink 1.15.3：SQL `EXPLAIN` 与 plan details](https://github.com/apache/flink/blob/c41c8e5cfab683da8135d6c822693ef851d6e2b7/docs/content/docs/dev/table/sql/explain.md)
- [Apache Spark 3.3.1：SQL `EXPLAIN` 语法与 parsed/analyzed/optimized/physical plans](https://github.com/apache/spark/blob/fbbcf9434ac070dd4ced4fb9efe32899c6db12a9/docs/sql-ref-syntax-qry-explain.md)
- [PostgreSQL 15：`EXPLAIN` 的计划、执行与 BUFFERS 语义](https://www.postgresql.org/docs/15/sql-explain.html)
- [Spider：跨领域复杂 text-to-SQL 的 schema 与 SQL 评测](https://arxiv.org/abs/1809.08887)
