---
title: "Apache Atlas 元数据怎么先服务运维：从 qualifiedName 到运行实例"
date: "2020-12-24 11:04:50"
updated: "2020-12-24 11:04:50"
categories:
- "数据治理"
tags:
- "Apache Atlas"
- "元数据"
- "数据血缘"
description: "基于 Apache Atlas 2.1 的类型模型、实体审计和血缘接口，讨论元数据平台怎样先回答故障定位与影响分析问题。"
cover: /images/articles/metadata-operations-evidence.svg
top_img: /images/articles/metadata-operations-evidence.svg
permalink: /2020/12/24/metadata-for-operations-first/
comments: false
editorial_standard: expert-v1
---

做元数据平台时，很容易先把精力花在资产目录、业务术语和页面分类上。界面做得很完整，任务失败时却还是有人在群里问：这张表谁负责，今天是哪段代码写的，改字段会影响哪些任务？

我更愿意从这些运维问题反推元数据模型。它们有明确答案，也能用一次真实故障检验。平台先把表、任务、实例和运行证据串起来，资产目录才不会只剩一棵需要人工维护的树。

下面用 Apache Atlas 2.1.0 的源码模型做参照。对应提交是 `da35519`，打包时间在 2020 年 7 月。Atlas 已经提供了实体唯一标识、Process 输入输出、实体变更审计和血缘查询；运行实例仍需要平台自己建模。

![面向运维的元数据与运行证据模型](/images/articles/metadata-operations-evidence.svg)

<!-- more -->

## 先让对象有稳定身份

Atlas 基础模型里，`Referenceable` 只有一个属性：`qualifiedName`。这个字段必填、建立索引，并且全局唯一。`Asset` 继承它以后，再增加 `name`、`description`、`owner` 等属性。

```json
{
  "name": "qualifiedName",
  "typeName": "string",
  "isIndexable": true,
  "isOptional": false,
  "isUnique": true
}
```

这比页面展示名重要。两个集群都可能有 `ods.order_info`，任务迁移后名称也可能不变。如果只拿库名、表名做主键，测试和生产很快会撞在一起。

我通常把环境和数据源实例写进 `qualifiedName`：

```text
hive://prod-cluster/ods/order_info
mysql://crm-prod/customer/customer_profile
job://prod/datax/order_mysql_to_hive
```

格式本身不是标准，稳定才是要求。采集器升级、页面改名、Atlas 内部 GUID 变化，都不应该让同一个业务对象变成新资产。Atlas 的实体接口支持通过类型加唯一属性查询，血缘接口也可以通过 `typeName + qualifiedName` 找到实体，这正好适合外部平台保存自己的稳定标识。

如果对象身份没有先定下来，后面所有血缘、负责人和告警关联都会变成模糊匹配。元数据重复往往不是清理脚本没写好，而是最开始就没有定义“同一个对象”是什么意思。

## `Process` 能表达依赖，表达不了一次运行

Atlas 基础模型把数据对象抽象成 `DataSet`，把加工过程抽象成 `Process`。`Process` 有 `inputs` 和 `outputs` 两组 `DataSet` 关系：

```text
orders_raw ----> datax_order_sync ----> ods_orders
  DataSet              Process            DataSet
```

这足够表达设计态血缘：某个任务通常读哪些表、写哪些表。运维现场还缺一个对象，即“这一次运行”。

任务定义和任务实例不能混用。定义回答的是代码与调度配置，实例回答的是某个时间点究竟运行了什么。我会在 Atlas 模型外扩展一个 `JobRun`，至少保留这些字段：

```text
runId
jobQualifiedName
scheduledTime / startTime / endTime
state
codeVersion
configVersion
engineApplicationId
logUri
```

`JobRun` 关联当时的 Job 定义、代码版本和配置快照，再记录本次实际读写的数据对象。这样才能区分两类很像的问题：代码定义已经改成读新表，但凌晨失败的实例仍然运行旧版本；页面只展示最新任务配置时，这个差异会被抹掉。

实例对象也不该无限塞进 Atlas 主图。高频实例会让图存储和搜索索引迅速膨胀。我的做法是 Atlas 保存任务定义、资产和稳定关系，实例明细进入运行库；Atlas 上只挂最近一次状态、实例入口和需要长期留存的变更证据。影响分析走 Atlas，故障时间线走运行库，两边用同一个 `qualifiedName` 和 `runId` 对齐。

## 设计态血缘和运行态血缘要分开

SQL 解析能告诉我们一段代码可能读写哪些表。动态分区、条件分支、存储过程和运行参数加入以后，“可能”与“本次实际发生”会出现差异。

我会给血缘边保留来源：

| 血缘来源 | 它能说明什么 | 不能直接说明什么 |
| --- | --- | --- |
| SQL 静态解析 | 当前代码可识别的输入输出 | 本次实例是否走到该分支 |
| 引擎执行计划 | 提交时引擎准备访问的对象 | 任务是否成功提交数据 |
| Hook 或运行事件 | 某次执行实际观察到的读写 | 未被 Hook 覆盖的外部动作 |
| 人工维护 | 暂时无法自动采集的业务关系 | 关系是否一直保持最新 |

这四类边可以同时存在，但不能合成一条没有来源的线。否则影响分析只能回答“图上连着”，回答不了这条关系由谁采集、何时有效、失败实例是否真的写出了数据。

Atlas 的 `LineageREST` 支持按 GUID 查询，也支持按唯一属性查询；方向可以选 `INPUT`、`OUTPUT` 或 `BOTH`，默认深度是 3。接口解决的是图怎么取，可信度仍取决于我们写进图里的关系有没有证据。

## 实体审计只能证明元数据发生过变化

Atlas 的 Entity REST 提供 `/{guid}/audit`，可以按实体读取审计事件。它适合回答表负责人、分类或实体属性在什么时候被谁修改。

这类审计不能替代任务运行日志。实体的 `updateTime` 变化，只能证明 Atlas 中的对象更新过，不能证明源数据库那一刻真的完成了 DDL；一条 Process 血缘被创建，也不能证明任务成功跑过。

因此每次采集我都会多留三项：

```text
source       = hive-hook / scheduler / sql-parser / manual
observedAt   = 2020-12-24T10:56:31+08:00
sourceRef    = event-id / run-id / parser-version
```

遇到冲突时，先按来源与时间判断。比如 Hive Hook 在实例运行时采集到旧字段，而定时采集器十分钟后读到新结构，两份数据都可能是真的，只是观察窗口不同。直接用后写覆盖前写，会把故障现场清掉。

## 一条失败任务需要哪些元数据

假设同步任务 `order_mysql_to_hive` 在凌晨失败，我希望平台能从实例页直接得到下面这条链路：

```text
失败实例 runId
  -> 任务定义与代码版本
  -> 本次配置快照
  -> 源表和目标表的 qualifiedName
  -> 引擎 applicationId 与原始日志
  -> 上次成功实例
  -> 下游任务和负责人
```

有了这条链路，很多动作可以自动完成：确认失败前是否刚发布过代码，比较本次与上次成功实例的配置差异，查询目标表的下游影响，再把日志范围缩到对应引擎应用。

如果平台只能查到“这张表属于订单域”，它对治理汇报有用，对凌晨故障帮助有限。反过来，运维链路建立后，负责人、描述、分类和业务术语都有稳定对象可以挂载，资产建设反而更顺。

我会按以下顺序落地：先统一表与任务的 `qualifiedName`；再接任务发布和实例事件，让代码、配置、日志能回到一次运行；随后补表级设计态与运行态血缘；字段级血缘等 SQL 解析覆盖率和证据标记稳定以后再做。

这不是降低数据治理目标，而是先选择一条能被真实问题验收的路径。一次故障能否还原，比目录里录入了多少条描述更能说明元数据平台是否可靠。

## 源码与接口依据

- [`0010-base_model.json`：Referenceable、Asset、DataSet 与 Process](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/addons/models/0000-Area0/0010-base_model.json#L34-L198)
- [`EntityREST.createOrUpdate()`：创建或更新实体](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/webapp/src/main/java/org/apache/atlas/web/rest/EntityREST.java#L335-L355)
- [`EntityREST.getAuditEvents()`：实体审计事件](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/webapp/src/main/java/org/apache/atlas/web/rest/EntityREST.java#L794-L846)
- [`LineageREST.getLineageGraph()`：按 GUID 查询血缘](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/webapp/src/main/java/org/apache/atlas/web/rest/LineageREST.java#L79-L109)
- [`LineageREST.getLineageByUniqueAttribute()`：按 qualifiedName 等唯一属性查询](https://github.com/apache/atlas/blob/da3551938deceaf714f80ec8c0927161646cb8bb/webapp/src/main/java/org/apache/atlas/web/rest/LineageREST.java#L111-L151)
