---
title: "让自然语言成为数据 Catalog 的入口：模型负责解析，Catalog 负责给出对象"
date: "2023-04-24 10:08:56"
updated: "2023-04-24 10:08:56"
categories:
- "数据治理"
tags:
- "Apache Atlas"
- "数据 Catalog"
- "自然语言检索"
description: "结合 Apache Atlas 2.2.0 的 SearchParameters、类型系统、qualifiedName 与血缘接口，设计自然语言到结构化意图、Catalog 实体和关系证据的检索链路。"
cover: /images/articles/catalog-natural-language-entry.svg
top_img: /images/articles/catalog-natural-language-entry.svg
permalink: /2023/04/24/catalog-natural-language-entry/
comments: false
editorial_standard: expert-v1
---

数据 Catalog 常见的问题不是没有资产，而是用户不知道该怎么找。平台要求先选实体类型，再填库、表、标签、负责人，只有熟悉元数据模型的人才能用好。自然语言适合作为入口，但它不该绕开 Catalog，直接让模型根据一堆描述猜表。

我的设计是两段式：模型把问题解析成结构化检索意图，Catalog 用确定性查询返回实体；模型再基于实体和关系组织答案。对象身份、权限和血缘事实仍由 Catalog 决定。

![自然语言进入 Catalog 的两段解析](/images/articles/catalog-natural-language-entry.svg)

<!-- more -->

## 先把问题拆成 Catalog 能理解的条件

“找一下生产环境的订单明细表，谁负责，上游从哪来”至少包含四部分：实体类型是 table，环境是 production，关键词是订单明细，需要返回 owner 和 upstream lineage。模型输出固定 JSON，不直接输出 Atlas DSL：

```json
{
  "entity_types": ["hive_table"],
  "keywords": ["订单", "明细"],
  "filters": [{"field": "environment", "op": "eq", "value": "prod"}],
  "relations": ["owner", "upstream"],
  "limit": 10
}
```

字段、操作符和最大 limit 都由工具 schema 限制。平台把业务叫法映射到真实类型和属性，再生成 Catalog 原生搜索参数。模型不知道某属性时不能自己加一个 `is_prod=true`，而是返回未识别条件或使用受控的 alias dictionary。

Apache Atlas 2.2.0 的 `SearchParameters` 本身就区分 query、typeName、classification、termName、entity filters、tag filters、includeSubTypes 等字段。这些是自然语言意图可以映射的确定性能力。直接生成自由 DSL 会扩大语法和权限面，也难以校验每个条件来自用户还是模型推断。

解析结果要展示给用户。尤其“销售订单”可能是业务术语，也可能是表名关键词；“生产”可能指环境、集群或数据状态。低置信度条件进入候选问题，不偷偷选一个含义。

## 搜索返回的是候选实体，不是答案文本

全文检索适合找名称、描述和别名，类型/属性过滤负责约束范围，glossary term 与 classification 表示治理语义。它们应组合使用，而不是先把所有实体说明 embedding 后只按相似度排序。

每个候选至少返回 GUID、typeName、qualifiedName、display name、owner、状态、更新时间和匹配原因。`qualifiedName` 与 GUID 用于稳定识别对象，display name 只用于展示。同名表在不同 cluster/database 中是不同实体，不能让模型把名称最像的那个当唯一答案。

Atlas 的 Hive Hook 文档明确用 `db.table@cluster` 组成 table qualifiedName，并用它去重实体。自然语言层可以解释“生产订单表”，最终仍要落到具体 qualifiedName。若存在多个候选，应列出环境、库和 owner 让用户确认。

排序我会混合几类信号：精确名称/别名、业务术语关联、描述相关度、环境与类型匹配、使用热度、认证状态和新鲜度。热度只能是辅助，不能让一个被频繁误用的表压过官方认证资产。

## 关系展开必须从实体 ID 出发

用户确认实体后，再用 GUID 展开 columns、owner、glossary、classification 与 lineage。不要把候选表名重新交给模型生成第二次搜索，否则两阶段可能落到不同对象。

血缘回答需要方向、深度和过程类型。问“上游从哪来”时，默认只展开一到两层并标注直接/间接，避免把整个图返回。若某条边来自解析 SQL、某条边来自人工补录，证据等级应不同。模型可以按关系生成解释，但不能补一条图中不存在的边。

Atlas 的 Lineage REST 接口要求实体类型与唯一属性值，并注明这个属性应在实体间唯一，例如 qualifiedName。这个接口设计再次强调：关系查询需要稳定对象身份，不是模糊文本。

权限在每次关系展开时检查。用户能看到表，不一定能看到敏感列、负责人信息或跨域血缘。先从 Catalog 权限层拿到过滤后的图，再进入模型上下文，不能生成后靠关键词脱敏。

## 元数据缺失要原样暴露

自然语言入口会让 Catalog 的质量问题更快暴露。用户问 owner，实体字段为空；问业务含义，description 只有“ODS table”；问生产环境，环境属性没有统一枚举。模型最容易把这些空白补成流畅答案。

我要求答案区分三种状态：Catalog 已确认的事实、根据名称/关系得出的推断、当前缺失。推断需要明确标注，例如“从 qualifiedName 判断可能属于 prod 集群”；缺失则给出 owner 补录入口或治理工单，而不是生成一个常见团队名。

别名也要治理。口语“交易明细”“订单流水”可能都指一个术语，也可能在两个部门含义不同。alias dictionary 带 namespace、owner、有效期和映射对象。用户纠正后进入审核，不让单次对话直接改全局词典。

搜索无结果不等于资产不存在。可能是权限过滤、采集延迟、类型映射不全或用户条件冲突。响应中返回各阶段候选数和过滤原因的汇总，让使用者知道系统查过什么范围。

## 评测对象是“找对实体”

Catalog 问答首先测 entity resolution，而不是答案写得是否自然。为真实问题标注目标 GUID/qualifiedName、所需关系和允许的候选集合，统计 top-1、top-k、歧义识别与越权泄露。

同名对象、历史表、测试/生产、简称、拼写错误和跨语言描述要单独建用例。模型升级后只看平均命中率，可能把最危险的“测试表误当生产表”藏在总体提升里。

线上保存解析意图、生成的 SearchParameters、候选及分数、用户选择和最终关系查询。用户点击第二个候选，比一个笼统的差评更能说明排序问题。选中后又返回，可能说明实体找对了但元数据内容不够。

自然语言入口的目标，是让人不用学习 Catalog 的查询表单，也能进入同一套实体与关系体系。模型负责理解表达差异，Catalog 负责对象身份、过滤和证据。两层边界清楚后，体验可以变自然，治理底座仍然可靠。

## 对照源码与文档

- [Apache Atlas 2.2.0 `SearchParameters`：query、type、classification、term 与 filter 字段](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/intg/src/main/java/org/apache/atlas/model/discovery/SearchParameters.java#L41-L127)
- [Apache Atlas 2.2.0 Basic Search：全文、类型、分类和属性过滤](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/docs/src/documents/Search/SearchBasic.md)
- [Apache Atlas 2.2.0 Hive Hook：qualifiedName 格式与实体去重](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/docs/src/documents/Hook/HookHive.md#L21-L56)
- [Apache Atlas 2.2.0 Lineage REST：用唯一属性定位实体](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/webapp/src/main/java/org/apache/atlas/web/rest/LineageREST.java#L106-L146)
