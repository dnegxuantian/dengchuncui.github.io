---
title: "RAG 效果的上限，往往卡在元数据而不是模型"
date: "2023-05-14 17:06:43"
updated: "2023-05-14 17:06:43"
categories:
- "数据治理"
tags:
- "RAG"
- "元数据治理"
- "Apache Atlas"
description: "从对象身份、来源版本、有效时间、血缘和权限解释 RAG 的元数据上限，说明为什么缺失和冲突的事实无法靠更大的模型或更好的 embedding 修复。"
cover: /images/articles/rag-metadata-ceiling.svg
top_img: /images/articles/rag-metadata-ceiling.svg
permalink: /2023/05/14/rag-metadata-ceiling/
comments: false
editorial_standard: expert-v1
---

知识问答效果不好时，团队第一反应通常是换 embedding、调 top-k 或升级模型。我在数据平台场景里遇到的更多情况是：被索引的元数据本身不完整、没有版本，甚至彼此冲突。检索与生成只能重新排列现有信息，不能凭空修复事实链。

RAG 的上限取决于它能拿到什么证据。表名和描述只是最薄的一层；对象身份、来源、有效时间、负责人、血缘、权限和采集状态，决定答案能否从“听起来合理”走到“可以复核”。

![RAG 的上限由元数据事实链决定](/images/articles/rag-metadata-ceiling.svg)

<!-- more -->

## 同名对象先要有稳定身份

企业里出现多个 `orders` 很正常：生产与测试、Hive 与 MySQL、旧集群与新集群、原始层与服务层。把每张表的 `name + description` 做 embedding，召回时很难区分它们。模型看见三个相似片段后，往往会把 owner、字段和环境拼成一个不存在的对象。

索引单元必须绑定 Catalog entity ID 与 qualifiedName。Apache Atlas 的 Hive 模型用 `db.table@cluster` 形成 table qualifiedName，并以唯一属性去重。展示名称可以改，稳定身份不能跟着 UI 文案漂移。

我会在每个检索片段中保存 `entity_guid`、`qualified_name`、`entity_type`、`source_system`、`environment` 和 `metadata_version`。生成上下文按 entity 分组，禁止跨实体合并属性。用户没有指定环境时，列出候选而不是默认 production。

别名与业务术语也是关系，不是改名。一个 glossary term 可以关联多个物理表，一个表也可能承载多个业务概念。问“客户订单”时先找到术语，再沿关系到认证资产；仅用表名向量相似度，会把命名习惯当成业务定义。

## 元数据需要来源和证据等级

owner 可能来自 DDL、任务配置、组织系统或人工填写；description 可能来自注释，也可能是运营同学补录。不同来源冲突时，索引若只保留最终字符串，就无法决定哪个更可信。

每个属性应携带 provenance：source、collector、observed_at、source_version、confidence，以及是否经过人工认证。规则可以定义组织系统的在职负责人高于旧 DDL owner，认证指标定义高于临时文档。模型不参与决定事实优先级，只解释规则选出的结果。

采集失败不能沿用旧值而不标记。Hook 消息积压、Catalog API 超时、代码解析失败时，旧元数据仍可展示，但 freshness 状态应变成 stale。答案说“负责人是 A”与“最近一次成功采集显示负责人是 A，已 30 天未更新”不是同一可信度。

RAG 索引也要保存 source content hash。源属性变化后触发对应 chunks 重建；若采集到空值，需要判断是合法清空还是采集异常。简单 upsert 空字符串会把已有事实抹掉，简单忽略又会永久保留过期信息。

## 时间是事实的一部分

用户问“这个表由谁负责”，常默认现在；问“去年故障时谁负责”，需要历史有效期。Catalog 只保存当前 owner，RAG 再强也回答不了历史问题。

我倾向于用双时间：`valid_from/to` 表示事实何时在业务上有效，`observed_at` 表示平台何时采集到。组织调整在 5 月 1 日生效、5 月 3 日才同步，两个时间都要保留。查询“5 月 2 日”按 valid time 判断，同时可解释当时平台是否已观测。

文档也有时间。制度 v2 替代 v1 后，旧版本不应参与“当前规则”召回，但历史问题仍可能需要它。索引过滤根据 query intent 选择有效版本；用户没给时间时默认 current，并把知识更新时间放进答案。

删除要用 tombstone 表达，不立即失去历史身份。物理表下线后，当前搜索默认隐藏，血缘和事故审计仍能引用它。若向量库直接删掉且 Catalog 没历史，旧任务日志里的表名会变成无法解释的孤儿。

## 血缘质量决定“为什么”的回答

表结构能回答有哪些字段，血缘和过程元数据才能回答数据从哪里来、为什么变化。SQL parser 解析的列级血缘、运行时 Hook 采集的输入输出、人工声明的逻辑关系，证据强度不同。

我会把 edge 当一等对象：source/target entity、process/run、expression、collector、observed time 和 status 都要保存。只存 `A -> B`，无法解释是每天真实运行、代码静态推断，还是一次临时查询留下的关系。

RAG 生成血缘说明时，先从图查询拿到受权限过滤的路径，再把实体描述和 process 证据组合成上下文。不要让模型从多个表描述中猜关系。Atlas 的实体模型把 process 的 inputs/outputs 作为关系保存，这类结构化事实比文本相似度更适合回答路径问题。

图中断边要明确显示。上游 A 到中间 B 有证据，B 到 C 缺失时，答案不能把 A 直接说成 C 的确定上游。可以提示“当前 Catalog 未采集到完整链路”，并把缺口转成治理任务。

## 权限元数据错误比召回错误更危险

知识库索引权限标签若比源系统更新慢，用户可能召回刚被撤权的文档或表说明。权限不能只在导入时复制一次，需要事件同步、版本和失效窗口。

每次查询携带 subject、tenant、purpose 与 policy version。检索前按当前策略过滤 entity/chunk，生成前复核，点击引用时回源再次鉴权。缓存 key 也要包含权限上下文，不能把管理员查询结果复用给普通用户。

列级与行级权限会影响答案含义。用户能知道某表存在，但不能看到敏感列；系统应返回授权后的 schema，并说明部分字段不可见。用完整 schema 生成 SQL、最后再删结果列，会泄露字段名与统计特征。

权限采集失败采用 fail closed 还是保留旧快照，要按数据域定义。敏感域倾向 fail closed；普通技术文档可以短时间沿用 last-known-good，但答案标记策略版本和陈旧状态。

## 先治理高价值事实，不追求一次补全

元数据治理很容易变成填表运动。我的优先顺序由真实问题驱动：先统计用户最常问、最常答错的对象与属性，再补 owner、环境、业务定义、认证状态、上下游和更新时间。

每个答案反馈都落到缺失类型：对象没采集、身份冲突、属性为空、来源冲突、关系断裂、权限异常、版本过期。治理团队看到的是可修复的事实问题，不是一个模糊的“RAG 效果差”。

评测也按 metadata ceiling 分层。给定正确证据时模型能否答对，是生成能力；现有 Catalog 能否提供正确证据，是知识覆盖；检索能否找到，是索引能力。若知识覆盖只有 60%，模型准确率不可能通过调 Prompt 达到 90%。

我不会等 Catalog 完美后才上线 RAG，但会让系统暴露缺口。答案只使用有来源的事实，过期和冲突明确标注，无法确认就拒答。这样知识问答一边服务用户，一边成为元数据质量的观测入口。

更大的模型可以改善表达和推理，更好的向量模型可以改善召回，但对象身份、版本、时间、来源和权限仍必须由数据平台提供。RAG 的工程价值，恰恰是把这些底层事实以自然方式交给用户，而不是把元数据问题藏进一段流畅文本。

## 对照源码与论文

- [Apache Atlas 2.2.0 Hive 元数据模型：实体属性、inputs/outputs 与 qualifiedName](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/docs/src/documents/Hook/HookHive.md#L18-L56)
- [Apache Atlas 2.2.0 类型系统：Entity、Classification、Relationship 等模型](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/docs/src/documents/TypeSystem.md)
- [Retrieval-Augmented Generation：参数化模型与外部非参数记忆](https://arxiv.org/abs/2005.11401)
- [KILT：把知识密集型任务与可验证来源对齐的基准](https://arxiv.org/abs/2009.02252)
