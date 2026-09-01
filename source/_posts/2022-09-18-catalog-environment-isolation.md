---
title: "多环境 Catalog 为什么必须隔离提交权限：同名表不是同一个对象"
date: "2022-09-18 10:05:46"
updated: "2022-09-18 10:05:46"
categories:
- "数据治理"
tags:
- "Apache Iceberg"
- "Catalog"
- "权限隔离"
description: "结合 Apache Iceberg 0.14.1 的 Spark Catalog 配置和 Catalog API，说明开发、测试、生产环境如何隔离命名空间、元数据服务、Warehouse 与提交身份。"
cover: /images/articles/catalog-environment-isolation.svg
top_img: /images/articles/catalog-environment-isolation.svg
permalink: /2022/09/18/catalog-environment-isolation/
comments: false
editorial_standard: expert-v1
---

开发和生产都存在 `sales.orders` 时，最危险的不是用户查错表，而是一个带生产凭证的测试任务真的把生产 metadata pointer 提交成功。SQL 语句、表名和 schema 全都合法，事故不会在 parser 或 type checker 阶段被拦住。

多环境 Catalog 隔离不能只靠名称前缀。`dev_catalog` 和 `prod_catalog` 如果背后连的是同一个 Metastore、同一个 warehouse，并且作业拿到同一套写凭证，前缀只是提醒，不是安全边界。我要求名称、控制面、存储位置和执行身份四层同时隔离。

![开发与生产 Catalog 的控制面和提交身份隔离](/images/articles/catalog-environment-isolation.svg)

<!-- more -->

## Catalog 名称会被省略，不能当最后防线

Iceberg 0.14.1 在 Spark 中通过 `spark.sql.catalog.<name>` 注册 Catalog，可以配置 Hive Metastore URI、Hadoop warehouse、默认 namespace 和 per-catalog Hadoop 参数。SQL 可以写完整的 `hive_prod.db.table`，也可以 `USE hive_prod.db` 后只写 `table`。

这意味着当前 Catalog 与 namespace 是 session state。复制一段 SQL 到另一个 Notebook、连接池复用 Session、初始化语句失败，未限定名称的 `INSERT INTO orders` 就可能落到不同对象。代码 review 里看到表名正确，也无法证明运行时 current catalog 正确。

我会要求生产写操作使用三段式完整标识，并在提交前解析一次实际 table UUID、metadata location 和 warehouse 前缀。读取可以根据平台体验允许短名称，create/drop/alter/overwrite 则必须显式 Catalog。

但完整名称仍然不是权限。开发身份即使写出 `prod_catalog.sales.orders`，后端也应拒绝；依赖“工程师不会这样写”只是把边界交给习惯。

## 四层隔离分别解决什么

第一层是命名隔离。Catalog 名必须包含稳定环境语义，不能用 `default`、`hive` 这种容易在各处重定义的名称。平台把 environment 作为结构化属性，不从字符串猜测。

第二层是 metadata control plane。生产与非生产最好使用不同 Metastore/Catalog service，至少使用明确隔离的数据库、租户或 namespace，并验证底层实现真的提供权限边界。同一个 HMS 上只换 database 名，在拿到全局 HMS 权限的客户端面前仍然很脆弱。

第三层是 storage。`prod` 与 `dev` warehouse 使用不同根路径、bucket 或账号，存储策略拒绝开发角色写生产前缀。这样即使 Catalog 层配置错误，创建 metadata/data file 也会失败。

第四层是 identity。生产 writer 由调度/发布系统按任务下发短期身份，只允许目标 namespace 和必要动作；开发 Notebook 没有生产 commit/drop/delete 权限。不要把长期 AccessKey 写进公共 `core-site.xml` 或镜像。

这四层相互补位。只有存储隔离，没有 Catalog 隔离，开发任务可能改生产表指针到一个自己能写的错误位置；只有 Catalog ACL，没有存储隔离，泄露的路径凭证仍能绕过表格式直接删文件。

## 读、写、维护要拆成不同能力

Iceberg `Catalog` API 不只有 `loadTable`，还包含 create、drop、rename、register 以及 transaction。一个“能访问 Catalog”的角色太宽，平台应按动作拆权限。

查询身份只需 load/list 与读取 metadata/data files。Writer 需要创建 data/manifest/metadata 文件并提交 table state，但不一定需要 drop。DDL 管理身份可以变更 schema/property；维护身份需要 rewrite/expire，orphan cleanup 还包含物理删除，风险最高。

我会把 remove orphan、drop table purge、expire snapshots 的删除权限单独收口。日常 writer 不应拥有遍历并批量删除整个 warehouse 的能力。维护任务先生成候选清单，再通过受控执行身份删除。

生产临时授权还要绑定对象范围和有效期。例如发布任务只对 `prod.sales.orders` 获得 30 分钟 commit 权限，不能因为使用同一个 Spark 集群就能改整个 `prod` namespace。审计记录 subject、job instance、table UUID、base/new metadata location 与授权策略版本。

## 配置模板必须避免环境参数串线

同一份 Spark 镜像跑多环境很常见，问题通常出在运行配置拼装。全局 `hive-site.xml` 指向生产 HMS，开发任务只覆盖了 catalog name，却遗漏 URI；或者 per-catalog S3 endpoint 没注入，客户端退回全局 credentials。

Iceberg 文档说明，Catalog 的 URI 可以省略并回退到 `hive.metastore.uris`，per-catalog Hadoop 配置会覆盖全局 `spark.hadoop.*`。这些便利在多环境里也会产生隐式依赖。我会在生产模板禁止关键项留空：catalog implementation、URI、warehouse、FileIO、authentication 都必须显式渲染。

启动自检输出一份不含密钥的 catalog manifest：

```text
catalog_name, implementation, metastore_uri_hash,
warehouse_uri, file_io, credential_subject, environment
```

平台将它与任务声明的 environment 比较。`environment=dev` 却解析到 prod URI/warehouse，任务在执行 SQL 前失败。不要等第一条写入验证配置。

密钥也不能跟配置一起日志化。自检只展示 subject/role ARN、endpoint 和不可逆 hash，AccessKey、token、Kerberos keytab 内容全部脱敏。隔离审计需要知道“谁”，不需要知道“密码是什么”。

## 统一治理视图不等于统一提交入口

企业希望在一个数据目录中搜索 dev/test/prod 资产，这没有问题。元数据治理层可以只读采集各 Catalog，把环境、Catalog、namespace 和 table identity 一起索引，再建立跨环境的发布/派生关系。

危险的是为了“统一体验”，让一个中心服务持有所有环境写凭证，并代理任意 Catalog 操作。它会成为权限放大器：上游只传一个 table name，中心服务替它完成生产提交，业务身份边界消失。

更稳妥的方式是统一 control UI，但执行使用目标环境的 scoped identity。发布动作从 dev schema 生成 prod 变更计划，经过审批后由 prod executor 执行；中心层保存意图和审计，不把一把全局万能密钥下发给调用者。

跨环境复制也应创建新的 table identity。dev 与 prod 表可以有相同逻辑名称和 schema，却拥有不同 table UUID、metadata location 与生命周期。Catalog 中建立 promotion relation，不把两边合成同一物理对象。

## 用故障注入验证隔离，而不是看配置

上线前我会主动做负向测试：开发身份 load 生产表应按策略决定是否允许，create/append/alter/drop 必须拒绝；伪造 prod catalog name 指向 dev URI 应被 manifest 检查发现；生产 writer 尝试写 namespace 外对象应失败；维护身份过期后删除应失败。

同时检查失败发生在哪一层。Catalog ACL 拒绝是预期第一道；如果它配置失效，存储 policy 仍应拒绝。两层都通过才说明隔离不是纸面配置。

运行中监控跨环境 URI、异常 current catalog、dev subject 访问 prod endpoint、短时间批量 DDL 和 metadata location 跳出 warehouse 前缀。一次 commit 成功不等于合法，策略审计必须与表提交日志关联。

多环境隔离的目标不是让名称更规整，而是把误操作限制在它所属的环境。开发 SQL 再像生产，使用的身份和控制面也不应具备改变生产状态的能力。做到这一点，统一 Catalog 才能既方便搜索，又不牺牲提交边界。

## 对照源码与文档

- [Iceberg 0.14.1 Spark Configuration：HiveCatalog 与 HadoopCatalog 的独立配置](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-configuration.md#L28-L49)
- [Iceberg 0.14.1 Spark Configuration：Catalog URI、warehouse、default namespace 与 cache](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-configuration.md#L55-L76)
- [Iceberg 0.14.1 Spark Configuration：current catalog/namespace 可以省略](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-configuration.md#L79-L94)
- [Iceberg 0.14.1 Spark Configuration：per-catalog Hadoop 配置覆盖全局参数](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-configuration.md#L109-L115)
- [Iceberg 0.14.1 `Catalog` API：create、load 与 table transaction 的能力面](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/api/src/main/java/org/apache/iceberg/catalog/Catalog.java#L33-L151)
- [Iceberg 0.14.1 `HiveTableOperations`：表级锁、提交与未知状态检查](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/hive-metastore/src/main/java/org/apache/iceberg/hive/HiveTableOperations.java#L223-L312)
