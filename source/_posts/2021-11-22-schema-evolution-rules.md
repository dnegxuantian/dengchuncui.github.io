---
title: "Schema Evolution 为什么不能只检查字段名：Iceberg Field ID 与类型提升规则"
date: "2021-11-22 15:18:43"
updated: "2021-11-22 15:18:43"
categories:
- "数据治理"
tags:
- "Schema Evolution"
- "Apache Iceberg"
- "数据契约"
description: "结合 Apache Iceberg 0.12.0 的 Field ID、类型提升与 nullability 校验，说明字段新增、删除、改名和类型变更如何做兼容性治理。"
cover: /images/articles/schema-evolution-rules.svg
top_img: /images/articles/schema-evolution-rules.svg
permalink: /2021/11/22/schema-evolution-rules/
comments: false
editorial_standard: expert-v1
---

数据平台上的 schema 变更，最危险的往往不是 ALTER TABLE 报错，而是 ALTER 成功、任务也能跑，结果却把旧字段读成了另一个含义。

按字段位置读取的系统里，删除第二列后，后面的列全部向前移动；按字段名读取的系统里，先删除 `status`，过一段时间又新建同名字段，旧文件中的 `status` 可能被误认为新字段。单看最新 DDL，两次操作都合法，历史数据的语义却已经混在一起。

Apache Iceberg 0.12.0 用永不复用的 Field ID 跟踪列。改名和重排只改变显示信息，字段身份不变；删除后再添加同名列会拿到新 ID，旧数据不会“复活”。这套规则很适合用来理解 schema evolution 的核心：兼容性不是比较两份字段名列表，而是判断字段身份、类型和值域能否连续解释。

![Schema Evolution 从变更申请到读写验证](/images/articles/schema-evolution-rules.svg)

<!-- more -->

## 字段名和位置都不是稳定身份

一个 schema 里有三列：

```text
id:       field-id=1
status:   field-id=2
amount:   field-id=3
```

把 `status` 改名为 `order_status` 时，Field ID 仍是 2。旧 Parquet 文件无需重写，reader 按 ID 投影，知道新名字对应旧文件里的同一个字段。把列顺序改成 `id, amount, order_status`，ID 也不变，`amount` 不会因为位置变了就读到 status 的值。

如果删除 field-id 2，后来又添加一个叫 `status` 的新列，新列必须得到新的 ID，例如 4。名字相同不代表语义相同，旧文件里 ID 2 的数据不能投影到 ID 4。Iceberg 文档明确写明 Field ID 在一张表中永不复用。

这条规则也适用于 nested struct。`address.city` 改名、重排或删除时，嵌套字段仍要有自己的身份。只给顶层列分配 ID，无法安全处理复杂类型的演进。

我在元数据平台里会保留 `field_id`、parent ID、变更前后名称和 schema version。血缘与质量规则尽量绑定稳定 ID，再把当前字段名作为展示。否则一次 rename 会让平台误判为“旧列下线、新列上线”，历史血缘全部断开。

## 新增 Optional 与新增 Required 不是一件事

向已有表增加 optional 列，旧文件没有这个 Field ID，读取时可以返回 null，不需要重写数据。这是典型的向后兼容变更。

新增 required 列就不同。旧数据没有该字段，reader 无法凭空构造一个满足非空约束的值。Iceberg 的 `UpdateSchema` 把它明确标为 incompatible change，默认会拒绝，只有调用 `allowIncompatibleChanges()` 才允许绕过检查。

“允许绕过”不等于旧数据自动兼容。平台如果确实需要把 optional 改成 required，我会拆成几个步骤：

1. 新字段先以 optional 发布，生产端开始写入；
2. 对历史 snapshot 做回填，并验证 null 数为 0；
3. 检查所有 writer 已升级，不会继续产生 null；
4. 再提交 required 约束；
5. 对仍使用旧 schema 的 consumer 做回归。

默认值也要区分写入默认和读取默认。新 writer 没传值时填 0，不代表旧文件读取 ID 4 时自然就有 0。若表格式或引擎没有定义 read default，业务不能用一句“默认 0”掩盖 null。

把 required 直接加上去，往往只是把兼容性问题推给某个较晚升级的 reader。

## 类型变化只能在不会误解旧值时放行

Iceberg 0.12.0 的 `TypeUtil.isPromotionAllowed()` 允许的提升很克制：

```text
int    -> long
float  -> double
decimal(P,S) -> decimal(P',S)，P' >= P 且 scale 不变
```

`long -> int` 会截断，`double -> float` 会损失精度，自然不能作为无重写的 schema evolution。Decimal 只扩大 precision、保持 scale，是因为把 `decimal(10,2)` 解释成 `decimal(18,2)` 不改变小数点含义；改成 `decimal(18,4)` 虽然存储范围更大，数值尺度已经变化。

String 改 timestamp、bigint 改 string 这类“引擎能 CAST”也不等于表 schema 可直接修改。CAST 是一次显式计算，可以报告脏值；metadata-only evolution 要求所有旧文件都能按新类型安全读取。两者的风险边界不同。

需要不兼容类型变更时，我更愿意新建字段：

```sql
amount_string  -> 新增 amount_decimal
```

生产端双写一段时间，离线回填旧数据，比较转换失败数和金额聚合，消费者切换后再删除旧字段。虽然步骤多，但每一步有独立回滚点。直接把列类型改掉，一旦部分引擎缓存旧 schema，错误会同时出现在读写两端。

类型校验还要进入分区规则。Iceberg 源码在 promotion 函数上特意警告：修改规则前要确认不会给 partitioning 引入兼容问题。一个字段既是业务列又参与 partition transform 时，类型变化会影响文件裁剪与新旧 partition spec 的解释，不能只跑一次 `SELECT LIMIT 10`。

## 删除列只是从当前 Schema 隐藏

Iceberg schema update 是 metadata change，不会为了 drop column 立即重写所有 data file。旧文件中的物理字节仍然存在，只是新 schema 不再投影这个 Field ID。

这对性能有好处，对数据治理却有两个提醒。

第一，删除敏感字段不等于物理擦除。如果合规要求数据不可恢复，还要重写相关文件并处理保留的 snapshots、备份与对象版本。`ALTER TABLE DROP COLUMN` 只改变当前逻辑视图。

第二，历史 snapshot 仍可能用旧 schema 读取该字段。Time travel 和 rollback 是表格式能力，也意味着 schema 生命周期不能只看 current version。过期 snapshot 之前，存储清理和权限策略都要考虑旧版本。

同名重建必须拿新 Field ID，正是为了避免旧数据在逻辑上被重新暴露。元数据平台应把“rename”与“drop + add”作为两种不同操作审计：前者保持字段身份，后者创建新语义。只比较变更前后的名字，会把两者误判成一样。

## 表格式兼容不等于整条链路兼容

Iceberg 接受一次 schema update，只能证明表格式规则允许提交。上游 CDC、消息格式、计算引擎、UDF 和下游数据库可能有各自的 schema 缓存与兼容约束。

例如新列在 Iceberg 中是 optional，旧 reader 可以忽略，看似兼容；Kafka 消息使用严格 schema，消费者却可能因未知字段反序列化失败。列 rename 在 Iceberg 里依赖 Field ID 保持语义，但经 JDBC 导出到按字段名映射的目标库，目标端仍然会看到旧列消失、新列出现。

我会为一次变更画出生产者和消费者矩阵：

| 组件 | 需要验证的内容 |
| --- | --- |
| 源库 / CDC | DDL 与行事件顺序，旧事件按什么 schema 解码 |
| 消息层 | schema 兼容策略，key 是否变化 |
| 批流引擎 | connector 版本、catalog cache、投影与类型支持 |
| 表格式 | Field ID、允许的 promotion、snapshot 提交 |
| 下游接口 | 字段名、顺序、nullability 与序列化契约 |

上线顺序通常是“先让 reader 能读新旧两种形态，再升级 writer，最后收紧约束”。破坏性变更则用新字段或新版本 topic/table 过渡。先改 writer，再等 consumer 报错，是把兼容性测试放到了生产环境。

## 变更记录要能够解释每个历史文件

一个成熟的 schema registry 不只保存最新 JSON。至少要记录 schema version、Field ID 映射、变更类型、提交人、兼容性结论、表 snapshot ID、生效时间和受影响消费者。

读取故障发生时，需要回答某个 data file 是用哪个 schema 写的、当前 reader 用什么 schema 投影、中间经历过哪些 rename/drop/type promotion。没有版本链，只能看当前字段名猜历史。

发布校验也不应止于 ALTER 成功。我会准备包含 null、边界数值、旧 schema 文件、新 schema 文件和嵌套结构的样本，让当前与上一版 reader 都读取；再用实际查询验证列裁剪、partition pruning 和聚合结果。涉及 CDC 时，还要在 DDL 前后各写一批行，确认 schema history 能按事件位置恢复。

Schema evolution 真正解决的是旧数据、当前写入和未来 reader 如何共同存在。字段名只是人看到的标签，稳定身份与明确的兼容规则才是系统能长期演进的基础。

## 对照源码与文档

- [Iceberg 0.12.0 Table Evolution：支持的 schema 变更与 metadata-only 边界](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/site/docs/evolution.md#L18-L36)
- [Iceberg 0.12.0 Correctness：用唯一 Field ID 避免 rename、drop 与 reorder 误读](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/site/docs/evolution.md#L38-L50)
- [Iceberg 0.12.0 Schema：Field ID 在一张表内永不复用](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/site/docs/schemas.md#L30-L41)
- [`UpdateSchema`：新增 required 列与 optional -> required 属于不兼容变更](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/api/src/main/java/org/apache/iceberg/UpdateSchema.java#L133-L158)
- [`SchemaUpdate.updateColumn()`：类型变更调用 promotion 校验](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/core/src/main/java/org/apache/iceberg/SchemaUpdate.java#L247-L269)
- [`TypeUtil.isPromotionAllowed()`：int/float/decimal 的安全提升规则](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/api/src/main/java/org/apache/iceberg/types/TypeUtil.java#L235-L258)
- [Iceberg 0.12.0 Spec：schema evolution 的合法类型提升](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/site/docs/spec.md#L180-L196)
