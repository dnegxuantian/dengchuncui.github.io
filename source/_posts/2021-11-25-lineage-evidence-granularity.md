---
title: "数据血缘记录到表还是字段才够用：按问题选择证据粒度"
date: "2021-11-25 20:41:07"
updated: "2021-11-25 20:41:07"
categories:
- "数据治理"
tags:
- "数据血缘"
- "Apache Atlas"
- "元数据"
description: "结合 Apache Atlas 2.1 的 Process、Column Lineage 与 ProcessExecution 模型，说明表级、字段级和运行实例级血缘各自能回答什么问题。"
cover: /images/articles/lineage-evidence-granularity.svg
top_img: /images/articles/lineage-evidence-granularity.svg
permalink: /2021/11/25/lineage-evidence-granularity/
comments: false
editorial_standard: expert-v1
---

血缘项目最容易交付的是一张很大的图：点开一张表，左边几十张上游表，右边几十张下游表，连线铺满屏幕。演示时很直观，真正遇到问题却常常答不出来。

“改这个字段会影响谁”需要字段与表达式；“昨晚这批数据为什么错”需要运行实例、代码版本和输入输出水位；“这张表有哪些上游”用表级关系就够。把三种问题都塞进同一张表级拓扑，图再完整也只能回答资产发现。

Apache Atlas 2.1 的模型本身已经给出几种层次：基础 `Process` 通过 inputs/outputs 连接 DataSet；Hive 还有 `hive_column_lineage`，保存字段依赖和 expression；模型里也有 `ProcessExecution` 与 `hive_process_execution` 表达具体执行。关键不在于有没有这些类型，而是采集和查询时是否保留了问题需要的证据。

![数据血缘的四层证据粒度](/images/articles/lineage-evidence-granularity.svg)

<!-- more -->

## 表级血缘适合找范围，不适合解释字段

Atlas 的基础模型把 `Process` 定义为一种 Asset，拥有 `inputs: array<DataSet>` 和 `outputs: array<DataSet>`。一条 Hive SQL 读表 A、B，写表 C，可以形成：

```text
table A ----\
             > process P ----> table C
table B ----/
```

这层关系适合回答：C 的直接上游有哪些；删除 A 可能影响哪些下游表；某个数据域跨过了哪些系统。它也是大范围影响分析的入口，存储和查询成本相对可控。

但如果 SQL 是：

```sql
select
  a.order_id,
  a.amount - coalesce(b.refund_amount, 0) as paid_amount
from orders a
left join refunds b on a.order_id = b.order_id;
```

表级血缘只能说明 `orders`、`refunds` 都流向结果表，不能说明修改 `refund_amount` 会影响 `paid_amount`，也不能区分 `order_id` 只是 join key 还是直接复制到输出。

因此表级 impact 的结果应该写成“候选影响范围”，而不是“确定受影响字段”。它能缩小排查面，不能替代转换证据。

## 字段级血缘必须带依赖类型和表达式

Atlas Hive 模型把 `hive_column_lineage` 设为 `Process` 子类型，用 inputs/outputs 连接输入与输出列，并提供 `dependencyType` 与 `expression`。官方 Hive Hook 文档列了三种依赖：

- `SIMPLE`：输出列与输入值相同；
- `EXPRESSION`：输出由 SQL 表达式转换；
- `SCRIPT`：输出由用户脚本转换。

只记录 `refund_amount -> paid_amount` 仍然不够。表达式 `amount - coalesce(refund_amount, 0)` 说明影响方式，也暴露了 null 处理；如果新版本改成 `greatest(amount - refund_amount, 0)`，边仍然连接同样的字段，业务语义已经变化。

我会让一条字段血缘至少包含：输入字段稳定 ID、输出字段稳定 ID、依赖类型、归一化表达式、解析器版本、所属 process/version，以及无法解析时的原始 SQL 位置。字段名会 rename，稳定 ID 才能连接历史；表达式解析也会升级，不能把旧解析结果当成永远正确。

`select *`、UDF、动态 SQL 和脚本是覆盖率薄弱点。平台应显示“已解析 8/10 个输出字段”，并列出两个 unresolved，而不是为了让图完整，把整张输入表的所有列都连到所有输出列。错误的精确关系比缺失更危险。

## 运行级血缘回答的是“哪一次”

静态 process 描述任务通常怎样读写。生产问题发生在一次具体执行：某天补数使用了旧参数，读到错误分区，写出一版异常数据。只看最新 SQL，可能已经修复；只看表级边，又不知道是哪一轮实例产生了目标分区。

运行级血缘需要把 ProcessExecution 与调度实例关联起来。我会保存：

```text
process_id / process_version
schedule_instance_id / attempt_id
engine_application_id
start_time / end_time / result
input table snapshot / partition / offset
output snapshot / partition / commit id
code_version / config_version
```

这样一条链路不再只是 `A -> P -> C`，而是“2021-11-24 的 attempt 2，使用 process version 17，读取 A 的 dt=23 与 B 的 snapshot 291，提交了 C 的 dt=23”。

字段级告诉我 `paid_amount` 来自哪些输入；运行级告诉我昨晚那一批到底读了哪些版本。故障诊断通常需要二者交叉，不能选一个代替另一个。

运行关系也不应该覆盖静态 process。任务每天运行一次，静态定义只有一份，execution 会不断增长。两类实体生命周期不同，混在一个节点里会让“修改任务”和“追溯历史”互相污染。

## 血缘不是 SQL 解析结果的另一个名字

SQL parser 能从文本推导潜在输入输出，这是很重要的来源，却不一定等于真实运行。

任务可能根据参数拼接分区，代码分支在不同日期选择不同表；视图在运行时展开；UDF 内部访问外部数据；执行前后脚本又写了其他路径。反过来，一段 SQL 包含备用分支，实际运行并没有触发。

我会把证据来源分开：

| 来源 | 能证明什么 | 主要边界 |
| --- | --- | --- |
| 静态 SQL/代码解析 | 设计上可能访问的对象与表达式 | 动态 SQL、UDF、条件分支 |
| 引擎 plan / hook | 本次编译或执行识别的输入输出 | hook 覆盖、引擎版本、优化改写 |
| 运行输入输出水位 | 本次实际读取与提交的版本 | 需要引擎和表格式暴露 ID |
| 人工声明 | 外部脚本和无法解析的业务关系 | 可能过期，需要 owner 与复核时间 |

每条边带 `source_type`、采集时间和置信度，查询者才能判断它是推断、声明还是运行事实。把它们合并成一条没有来源的实线，会让系统显得确定，实际无法审计。

Atlas Hive Hook 通过 Kafka notification 异步更新元数据，官方配置也推荐 `synchronous=false` 以避免拖慢 Hive 查询，并提供重试次数和队列大小。这是合理的性能选择，也意味着查询成功和血缘入库成功不是同一个事务。Hook 队列满、通知失败或 Atlas 不可用时，运行已完成，血缘可能缺失。

因此采集链路本身要有指标：事件产生数、发送成功数、重试数、队列深度、消费延迟和死信。没有这组证据，“图上没边”无法区分确实无依赖，还是采集丢了。

## 图的深度要由问题控制

Atlas Lineage REST API 接受 `direction` 和 `depth`：可以查 INPUT、OUTPUT 或 BOTH，并限制跳数。这个设计比默认展开全图更实用。

做发布影响分析时，我通常先查输出方向 1 到 2 跳，找到直接消费任务和核心下游；需要追溯指标来源时，再沿输入方向逐层展开。一次返回全域图不仅慢，也让使用者无法区分直接与间接影响。

图查询还要处理环、共享维表和同一 process 的多版本。对于字段级血缘，一张宽表几百列，全部展开会产生大量节点。UI 可以先以表级聚合，用户选择某个字段后再加载 column lineage；运行实例则按时间和目标版本过滤，不要把三年 execution 全画出来。

我会让影响分析结果保持路径证据，例如：

```text
source.refund_amount
  --[EXPRESSION: amount - coalesce(refund_amount, 0)]-->
dwd_order.paid_amount
  --[SIMPLE]-->
ads_revenue.paid_amount
```

有路径才能人工复核。只返回“影响 37 张表”这个计数，用户仍不知道最关键的传播链在哪里。

## 完整度要能量化，而不是凭图判断

血缘平台需要一组质量指标。基础层可以统计有 owner 的任务比例、成功执行中收到 hook 事件的比例、解析成功的输出字段比例、存在稳定 qualifiedName 的资产比例、运行实例能关联 input/output version 的比例。

这些指标最好按引擎、项目和时间展示。Hive SQL 覆盖 95%，Python 脚本只有 20%，整体平均 80% 会掩盖真正的盲区。某次发布后 hook 成功率从 99% 掉到 70%，也应该像数据任务失败一样告警。

Atlas 的 `qualifiedName` 在基础模型中是必填、可索引且唯一的属性，Hive 文档又把 clusterName 放进库表列的 qualifiedName。多集群接入时，这一点尤其重要：`db.table` 在测试和生产同时存在，若资产身份没有环境/集群维度，跨环境血缘会被错误合并。

最终我希望一张血缘图上的每条线都能回答三个问题：这是什么粒度，来自哪种证据，对应哪个版本或运行。能回答，血缘才可以用于变更审批和故障定位；回答不了，它更接近一张资产关系示意图。

## 对照源码与文档

- [Atlas 2.1 基础模型：Process 通过 inputs/outputs 连接 DataSet](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/addons/models/0000-Area0/0010-base_model.json#L154-L196)
- [Atlas 2.1 基础模型：qualifiedName 必填、索引且唯一](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/addons/models/0000-Area0/0010-base_model.json#L37-L49)
- [Atlas 2.1 Hive 模型：hive_process 保存 queryText](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/addons/models/1000-Hadoop/1030-hive_model.json#L80-L127)
- [Atlas 2.1 Hive 模型：hive_column_lineage 与 expression](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/addons/models/1000-Hadoop/1030-hive_model.json#L435-L459)
- [Atlas Hive Hook：字段血缘的 SIMPLE、EXPRESSION 与 SCRIPT 依赖](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/docs/src/documents/Hook/HookHive.md#L95-L108)
- [Atlas Hive Hook：异步通知、重试与队列配置](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/docs/src/documents/Hook/HookHive.md#L61-L89)
- [`LineageREST`：按 direction 与 depth 查询 lineage graph](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/webapp/src/main/java/org/apache/atlas/web/rest/LineageREST.java#L79-L106)
