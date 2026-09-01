---
title: "统一 Catalog 之前，先把对象身份说清楚：qualifiedName 不是显示名称"
date: "2022-03-04 13:33:28"
updated: "2022-03-04 13:33:28"
categories:
- "数据治理"
tags:
- "Apache Atlas"
- "Catalog"
- "元数据"
description: "结合 Apache Atlas 2.2.0 的类型模型与 Hive Bridge 源码，说明统一 Catalog 中 qualifiedName、命名空间、GUID 和对象重命名的设计边界。"
cover: /images/articles/catalog-object-identity.svg
top_img: /images/articles/catalog-object-identity.svg
permalink: /2022/03/04/catalog-object-identity/
comments: false
editorial_standard: expert-v1
---

做统一 Catalog 时，团队通常先讨论要接哪些数据源、搜索框怎么做、血缘图画到字段还是表。我更愿意先追问一个看起来很基础的问题：`prod` 和 `test` 里都叫 `sales.orders` 的两张表，到底是不是同一个对象？

这个问题没答清楚，后面所有治理功能都会漂。采集任务重复跑一次可能多出一张表；集群迁移后，原来的标签和负责人找不到了；表重命名既可能把历史血缘切断，也可能错误地把两个对象合并。Catalog 不是把各种名称塞进一个搜索索引，它首先是一套对象身份系统。

![Catalog 对象标识从采集输入到稳定引用](/images/articles/catalog-object-identity.svg)

<!-- more -->

## `name` 解决展示，`qualifiedName` 解决唯一定位

Apache Atlas 2.2.0 的基础类型 `Referenceable` 把 `qualifiedName` 定义为必填、可索引且唯一的属性。Hive Bridge 为 database 生成 `db@metadataNamespace`，为 table 生成 `db.table@metadataNamespace`，column 则在 table qualifiedName 上继续增加列名。

例如两个环境都有 `sales.orders`：

```text
sales.orders@prod-hive-a
sales.orders@test-hive-a
```

它们的 `name` 都可以展示为 `orders`，但身份不同。这里的 `metadataNamespace` 不是为了让字符串显得完整，而是把对象放回它所属的元数据域。环境、集群或服务实例如果不进入这个域，同名对象只能靠偶然不重复来维持，迟早会冲突。

Atlas 的实体接口也把这条边界暴露得很直接：除 GUID 外，可以用 `typeName + unique attributes` 查找、更新或删除实体，文档注释给出的典型 unique attribute 就是 `qualifiedName`。`AtlasObjectId` 没有 GUID 时，`equals()` 也会比较 typeName 与 uniqueAttributes。

这意味着 `hive_table:sales.orders@prod-hive-a` 与 `rdbms_table:sales.orders@prod-hive-a` 仍然可以是两个不同类型的对象。统一 Catalog 不等于抹掉类型；相同字符串在不同类型里可能代表不同的访问协议、字段语义和治理动作。

## 命名空间必须由平台管理

我遇到过最麻烦的做法，是让每个采集插件自己拼 qualifiedName。Hive 插件用 `db.table@cluster`，JDBC 插件用 `host:port/database/schema/table`，文件插件直接用 URI，另一个团队又把租户放在最前面。每个格式单独看都合理，放到血缘和权限系统里就无法稳定关联。

平台至少要集中定义四件事。

第一，环境边界。生产、预发、测试即使连的是相同技术类型，也不能因为逻辑名称相同就合并。环境最好是资源实例的属性，同时进入可计算的命名空间，不靠 UI 颜色区分。

第二，服务实例边界。两个 Hive Metastore、两个 Kafka 集群或两个 MySQL 实例里的同名对象不相等。host 可以参与实例注册，但不建议把易变的 VIP 或 IP 直接当永久身份；更稳妥的是给已登记的数据源实例分配稳定 ID，再把连接地址作为可变属性。

第三，大小写与转义规则。Hive Bridge 在构造 database/table qualifiedName 时会转为小写。如果另一个入口保留大小写，同一张表可能产生两个实体。路径中的 `/`、数据库名中的特殊字符、默认 schema 的省略，都要在进入 Catalog 之前规范化。

第四，临时对象规则。Atlas 对 Hive temporary table 会把 session ID 或随机串加进表名，目的就是避免把两个会话的临时表合并。平台如果完全忽略临时对象，会丢失一部分运行血缘；如果把它们当永久资产，又会让搜索结果充满垃圾。身份策略要配合生命周期策略。

## GUID 稳定，不代表对象语义天然稳定

Catalog 创建实体后通常会分配 GUID，后续关系、标签和血缘可以引用 GUID。GUID 适合作为内部稳定主键，但它不能替代业务身份规则。

一次采集如果因为 qualifiedName 拼法变化而找不到原实体，系统会创建新 GUID。旧标签、负责人、热度和血缘仍挂在旧 GUID 上，用户看到的就是两张“长得一样”的表。相反，如果错误地复用了 qualifiedName，另一个物理对象的属性可能覆盖到原 GUID，问题更隐蔽。

所以采集写入不能直接执行“查不到就创建”。我会先记录 source identity、normalized qualifiedName、matched GUID 和匹配方式。新增、更新、冲突、疑似重命名应该是不同结果：

| 结果 | 判断 | 动作 |
| --- | --- | --- |
| 精确匹配 | type 与 qualifiedName 一致 | 更新可变属性 |
| 首次出现 | 无匹配且命名空间有效 | 创建实体 |
| 唯一键冲突 | 同键出现不兼容的物理属性 | 隔离并告警 |
| 疑似重命名 | 新键与旧实体具有强关联证据 | 进入迁移流程，不自动合并 |

这张映射表还能解释采集幂等性。Kafka 消息重复、Hook 重试或全量爬取重复执行时，只要同一业务对象归一到同一 unique key，就会更新原实体，而不是不断制造副本。

## 重命名和迁移要明确是“同一对象”还是“新对象”

SQL 的 `ALTER TABLE old RENAME TO new` 看起来是改名，Catalog 却要决定历史怎样延续。如果业务认为表只是换了名称，最好保留原 GUID，更新 qualifiedName，并记录 old qualifiedName 的别名或变更事件。这样标签、负责人和历史血缘仍指向同一实体。

但不是所有名字变化都属于重命名。把表从测试集群 CTAS 到生产集群，即便字段完全相同，也通常是两个对象和一条派生关系。把 HDFS 表迁到 Iceberg，物理位置和访问语义都变了，也可能需要创建新实体，再用 migration/derived-from 关系连接，而不是原地改 `typeName`。

判断依据不能只有“名字像”。我会组合 DDL 事件、操作类型、源/目标实例、schema 指纹、location、创建时间和运行实例。只有明确的 rename event 才自动延续身份；相似度匹配最多给出候选，不能直接改 GUID。

删除也不是立即从图里擦掉。Catalog 需要把实体标记为 DELETED 或归档，保留历史 lineage 和审计。随后同名表重新创建时，是恢复旧实体还是产生新实体，要结合底层系统是否保留原 object ID、创建时间和删除间隔。单靠 qualifiedName 相同无法判断。

## 跨系统关联要保留“映射”，不要硬造全局名字

统一 Catalog 经常希望把 Hive、Iceberg、Trino 和 BI 系统看到的对象合并成一张资产。这里容易走向另一个极端：设计一条覆盖所有系统的超长 global qualifiedName，然后要求每个插件都能精确生成。

实际上一份数据会有多个合法身份。Iceberg table 有 catalog namespace 与 table identifier，Hive Metastore 有 database/table，存储层有 location，Trino 又通过 catalog.schema.table 暴露。它们可能一一对应，也可能多对一、一对多。把所有身份强行压成一个字符串，会丢掉这种关系。

我更倾向于让每种实体类型保留自己的规范身份，再建立显式映射：`logical_dataset` 代表业务资产，`hive_table`、`iceberg_table`、`rdbms_table` 代表技术对象，`storage_path` 代表物理位置。映射关系要带来源、置信度、有效期和确认状态。

这样做搜索时可以按逻辑资产聚合，排障时又能落回具体对象。更重要的是，当连接地址、Catalog 名或引擎映射变化时，只更新相应技术对象与映射，不必重写整张元数据图。

## 上线前用冲突样本验身份规则

对象标识方案不能只用几张正常表验证。我会准备一组容易撞边界的样本：不同环境同名表、不同集群同名库、大小写不同的表、带特殊字符的字段、临时表、rename 后的表、删除后同名重建，以及同一路径被两个 Catalog 注册。

每个样本都连续采集两次，确认第二次不会新增实体；再改变一个维度，确认该合并的仍命中原 GUID，该分开的会生成新实体。最后检查血缘边、标签和 owner 是否跟着正确的 GUID 走。

运行中还要监控 qualifiedName collision、同源多 GUID、同 GUID 多物理位置和短时间大量新增/删除。采集成功率 100% 不能证明身份正确，因为错误合并同样会返回成功。

Catalog 真正难的不是把元数据收进来，而是多年以后仍能回答“这是不是当年的那个对象”。把 `name`、qualifiedName、GUID、物理位置和逻辑资产各自的职责分开，搜索、血缘、权限和审计才有可靠的地基。

## 对照源码与文档

- [Atlas 2.2.0 基础模型：`Referenceable.qualifiedName` 必填、可索引且唯一](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/addons/models/0000-Area0/0010-base_model.json#L54-L68)
- [`HiveMetaStoreBridge`：database、table 与 column qualifiedName 的生成规则](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/addons/hive-bridge/src/main/java/org/apache/atlas/hive/bridge/HiveMetaStoreBridge.java#L859-L932)
- [`EntityREST`：使用 type 与 unique attribute 定位并更新实体](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/webapp/src/main/java/org/apache/atlas/web/rest/EntityREST.java#L257-L295)
- [`AtlasObjectId.equals()`：无 GUID 时按 typeName 与 uniqueAttributes 判断对象](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/intg/src/main/java/org/apache/atlas/model/instance/AtlasObjectId.java#L156-L178)
