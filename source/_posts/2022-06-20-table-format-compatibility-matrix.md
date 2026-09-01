---
title: "Iceberg 表格式升级前，为什么要做 Reader / Writer 兼容矩阵"
date: "2022-06-20 17:28:26"
updated: "2022-06-20 17:28:26"
categories:
- "湖仓架构"
tags:
- "Apache Iceberg"
- "表格式"
- "兼容性"
description: "基于 Apache Iceberg 0.13.2 的 v1/v2 规范以及 Spark、Flink 支持边界，说明表格式升级为什么必须逐一验证 Reader、Writer、Catalog、SQL 与维护任务。"
cover: /images/articles/table-format-compatibility-matrix.svg
top_img: /images/articles/table-format-compatibility-matrix.svg
permalink: /2022/06/20/table-format-compatibility-matrix/
comments: false
editorial_standard: expert-v1
---

把 Iceberg 表的 `format-version` 从 1 改成 2，看起来只是一条表属性更新。真正危险的是，这张表往往同时被 Spark、Flink、Trino、离线维护脚本和自研 SDK 访问。创建表的人确认自己的引擎能读 v2，并不能证明整条生产链路已经兼容。

格式版本升级与普通依赖升级不同。旧 reader 遇到自己不理解的新表特性，正确行为应该是拒绝读取；更糟的实现可能加载成功，却没有应用 delete files，悄悄把已删除的行读出来。上线前必须把“有哪些访问者、每个访问者执行什么动作”展开成矩阵。

![表格式升级需要验证的五类兼容边界](/images/articles/table-format-compatibility-matrix.svg)

<!-- more -->

## Format Version 管的是磁盘语义，不是客户端版本号

Iceberg 0.13.2 规范已经采纳 v1 和 v2。v1 定义不可变 Parquet、Avro、ORC 文件上的分析表；v2 增加 row-level updates/deletes，核心变化是用 delete files 表示已有 data files 中哪些行已经失效。

`format-version=2` 不是“Iceberg jar 版本 2”，也不是“打开 UPDATE 语法”。它声明这张表的 metadata 和 content files 可以使用 v2 语义。规范明确要求，遇到高于实现支持范围的格式版本必须抛错，因为旧实现无法保证正确解释新的字段和规则。

同样，升级到 v2 不代表表会立即产生 delete file。只做 append 的 v2 表，物理内容可能暂时与 v1 很接近；但一旦某个 writer 提交 row-level delete，所有 reader 都必须正确把 delete 应用到扫描结果。测试只覆盖“升级后还能 SELECT”远远不够，必须覆盖真正使用新能力后的读结果。

规范还说明 v1 data/metadata files 在升级到 v2 后仍然有效。这保证向前升级不要求全表重写，却不意味着可以随意降级。`TableMetadata.Builder.upgradeFormatVersion()` 在源码里只允许新版本大于等于当前版本，明确拒绝 downgrade。回滚方案不能写成“出问题再把属性改回 1”。

## 先列访问路径，再填能力矩阵

我会先从 Catalog 审计、作业调度、查询网关和代码仓库里找出真实访问者，不靠群里询问“还有谁在用”。同一个 Spark 集群可能既有 SQL extension 作业，也有 DataFrame V1 writer；同一个 Flink 版本可能同时存在 batch read、streaming append 和维护 Action。

矩阵的行不是笼统的产品名称，而是可部署的运行组合：

```text
Spark 3.1 + Iceberg runtime 0.13.2 + extensions enabled + HiveCatalog
Flink 1.14 + Iceberg runtime 0.13.2 + HiveCatalog
自研 Java 服务 + iceberg-core 0.11.x + HadoopCatalog
```

列则按动作拆开：load table、snapshot scan、read position delete、read equality delete、append、overwrite、UPDATE、MERGE、expire snapshots、rewrite data files。每个单元格标记 SUPPORTED、UNSUPPORTED、NEEDS_CONFIG 或 NOT_USED，并附真实测试证据。

这样才能暴露一种常见误判：某个引擎“支持 Iceberg”，但只支持 append/read；另一个版本支持 SQL DELETE，却以 copy-on-write 重写 data files，并没有覆盖 equality delete reader；维护脚本能加载表，却使用了不兼容的旧 core jar。

## SQL 能解析，不等于表操作能正确执行

Iceberg 0.13.2 的 Spark 写入文档列出 SQL `MERGE INTO`、`DELETE FROM`、`UPDATE` 等能力，同时注明部分计划要求启用 Iceberg Spark extensions。Spark 3.1 才增加 UPDATE 支持，Spark 2.4 的 DataFrame overwrite 行为与 Spark 3 也不相同。

因此兼容测试至少要过四层：SQL parser 是否接受语句；planner 是否生成预期 Iceberg operation；writer 是否正确提交 data/delete files；另一个独立 reader 是否读到正确结果。只在同一 Session 里执行 UPDATE 后再 SELECT，可能让 writer 和 reader 共用同一套错误实现，无法形成交叉验证。

Flink 侧也不能用一句“支持 Flink”概括。0.13.2 文档列出的集成版本为 Flink 1.12、1.13、1.14，能力表中 SQL ALTER 仅支持表属性，列和分区变更不支持；metadata tables 在 Java API 可用，但 Flink SQL 不支持。平台 UI 如果暴露统一按钮，后端必须按引擎能力做约束，不能把不支持的操作提交后再等运行报错。

我还会验证 SQL 之外的入口。某些作业调用 `DataFrameWriter`，某些用 `DataFrameWriterV2`，有的直接调用 Iceberg Java API。它们加载同一表，写入语义和 Catalog 选择可能不同。矩阵按运行路径建，不能按文档目录建。

## Reader 比 Writer 更值得先升级

多引擎环境里，我通常先升级 reader，再升级 writer，最后才修改表格式。原因很简单：只要有一个新 writer 开始产生 v2 delete files，所有仍在生产的 reader 都必须理解它们。

第一阶段让新版 reader 继续读取 v1 表，验证它与旧结果一致。第二阶段在隔离 Catalog 创建 v2 测试表，写 position/equality deletes，由每种 reader 读取并对账。第三阶段冻结新增旧客户端，确认调度平台不会再投递旧镜像。最后才升级真实表，并允许 v2 writer 使用新能力。

读验证不能只做 `count(*)`。需要准备能区分 delete 应用错误的样本：同一个业务键的旧值与新值、跨分区 equality delete、同一 commit 的 data 与 position delete、历史 snapshot time travel。结果要与基准数据逐行或按强校验和比较。

还要验证 projection 与 filter。一个 reader 全列扫描时正确，不代表只投影部分列时仍会加载 equality delete 所需字段；带 predicate 时也要确认 file/delete pruning 没有错误跳过删除文件。

## Catalog 与打包冲突也是兼容性的一部分

表格式正确，Catalog 配错同样会造成事故。Spark 通过 `spark.sql.catalog.*` 注册 Catalog；不同入口可能把同一标识解析到 HiveCatalog、HadoopCatalog 或 session catalog。测试环境使用 HadoopCatalog 成功，不代表生产 HMS 上的锁与原子提交配置也正确。

运行包还会带来依赖冲突。把多个 Iceberg runtime jar、引擎自带 connector 与用户 jar 同时放到 classpath，最终加载哪个类取决于 classloader。平台应该记录实际 jar checksum 和启动日志中的实现版本，不能只登记 Maven POM 里声明的版本。

我会加一个启动自检：加载目标表，输出 table UUID、metadata location、format version、Catalog implementation 和 Iceberg code source。若作业解析到另一个 Catalog 或旧 jar，在处理数据前就失败。

Catalog 权限也要分别测试 read 与 commit。一个服务账号能读取 metadata，不代表有权限原子更新 pointer；maintenance 账号可能需要删除文件，却不应拥有业务写入权限。能力矩阵里的 SUCCESS 必须在生产同类身份与存储策略下验证。

## 升级方案必须包含不可降级的回滚路径

因为 format version 不能直接 downgrade，真正的回滚有两类。

如果只升级属性、尚未产生 v2-only 内容，可以停止 writer，把 reader 切回升级前的 snapshot 或复制到新建 v1 表；能否安全做取决于所用版本和 Catalog 操作，不能在事故现场临时猜。若已经产生 delete files，则必须用兼容 reader 把当前逻辑结果物化为一张新的 v1 表，再切换消费者。

这意味着升级前要保存 base metadata location、snapshot ID、表属性和所有消费者清单，设置变更窗口，禁止未知 writer。升级后先执行受控 append，再执行受控 row-level operation，每一步都用异构 reader 对账。

验收通过后，矩阵也不能丢。后续新增一个查询引擎、升级一个 connector 或恢复旧作业镜像时，都要经过同一套能力检查。表的兼容边界会随访问者变化，不是一次升级会议的附件。

表格式真正提供的是跨引擎共享数据语义。越是希望“一份表到处读写”，越要把每个 reader、writer 和维护工具的能力写清楚。格式升级那条 ALTER 很短，准备工作应该比它长得多。

## 对照源码与文档

- [Iceberg 0.13.2 Spec：格式版本的 forward compatibility 边界](https://github.com/apache/iceberg/blob/0784d64a659abd4fdaa82cdb599a250a7514facf/site/docs/spec.md#L20-L40)
- [Iceberg 0.13.2 Spec：reader 遇到不支持的 format-version 必须报错](https://github.com/apache/iceberg/blob/0784d64a659abd4fdaa82cdb599a250a7514facf/site/docs/spec.md#L604-L618)
- [`TableMetadata.upgradeFormatVersion()`：允许升级、拒绝降级](https://github.com/apache/iceberg/blob/0784d64a659abd4fdaa82cdb599a250a7514facf/core/src/main/java/org/apache/iceberg/TableMetadata.java#L813-L824)
- [Iceberg 0.13.2 Spark Writes：不同 Spark API 与 SQL 能力边界](https://github.com/apache/iceberg/blob/0784d64a659abd4fdaa82cdb599a250a7514facf/site/docs/spark-writes.md#L18-L40)
- [Iceberg 0.13.2 Spark Writes：DELETE、UPDATE 与文件重写语义](https://github.com/apache/iceberg/blob/0784d64a659abd4fdaa82cdb599a250a7514facf/site/docs/spark-writes.md#L162-L201)
- [Iceberg 0.13.2 Flink：支持版本与 SQL/API 能力表](https://github.com/apache/iceberg/blob/0784d64a659abd4fdaa82cdb599a250a7514facf/site/docs/flink.md#L18-L39)
