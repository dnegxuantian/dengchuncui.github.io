---
title: "DataX 测试连接成功为什么任务仍会失败：从 JDBC 握手到 dryRun 预检"
date: "2021-01-18 20:50:54"
updated: "2021-01-18 20:50:54"
categories:
- "数据同步"
tags:
- "DataX"
- "JDBC"
- "故障诊断"
description: "从 DataX RDBMS Reader 与 Writer 的预检源码解释测试连接、查询权限、切分键、写入权限和真实长任务之间的验证边界。"
cover: /images/articles/datax-datasource-precheck.svg
top_img: /images/articles/datax-datasource-precheck.svg
permalink: /2021/01/18/datax-datasource-precheck/
comments: false
editorial_standard: expert-v1
---

数据源页面显示“测试连接成功”，任务发布后仍然报表不存在、没有查询权限或连接中断，这种情况并不矛盾。测试连接通常只完成 JDBC 建连，最多证明当前网络、账号和密码能建立一个短连接。

同步任务要求更多：Reader 要执行真实 SQL，切分键需要能参与查询；Writer 要有目标表写入权限，`preSql`、`postSql` 还要通过语法检查。任务跑几个小时以后，连接空闲超时、游标、字符集和网络设备的行为也会出现。

DataX 在 2020 年底已经有两套不同深度的检查：`DBUtil.testConnWithoutRetry()` 和 Job 的 `dryRun`。把源码走一遍，就能知道页面上的绿色图标到底证明了什么。

![DataX 数据源从建连到真实任务的检查层次](/images/articles/datax-datasource-precheck.svg)

<!-- more -->

## 建立 JDBC Connection 只过了第一层

`DBUtil.testConnWithoutRetry()` 的普通分支很短：

```java
connection = connect(dataBaseType, url, user, pass);
if (connection != null) {
    return true;
}
```

MySQL 在指定 `checkSlave` 时会多查一次主从延迟，其余情况拿到非空 Connection 就返回成功。这个方法能够发现地址不可达、驱动不匹配、认证失败等问题，不能证明账号能读取任务中的表。

把连接测试拆开看，大概有这些层次：

| 层次 | 可以验证 | 仍未验证 |
| --- | --- | --- |
| TCP / JDBC 建连 | 地址、端口、驱动、账号认证 | 表权限和 SQL |
| 查询预检 | 表、字段、查询权限、部分 SQL 语法 | 大结果集和长时间游标 |
| Writer 预检 | INSERT/DELETE 权限、pre/post SQL 语法 | 实际批次提交与锁冲突 |
| 小规模试跑 | 字段转换、字符集、读写路径 | 峰值数据量与长时稳定性 |
| 生产运行 | 真实吞吐与持续连接 | 下一次网络或数据变化 |

我会让页面明确显示每一层的结果，而不是把它们压成一个“连接正常”。用户看到绿色标记，自然会认为任务已经具备读写条件；如果系统只做了第一层，问题其实出在产品语义。

## `dryRun` 会初始化插件并调用 Reader、Writer 预检

Job 配置 `job.setting.dryRun=true` 时，`JobContainer.start()` 不进入正常的 `prepare -> split -> schedule`，而是执行 `preCheck()`：

```java
isDryRun = configuration.getBool("job.setting.dryRun", false);
if (isDryRun) {
    this.preCheck();
} else {
    this.preHandle();
    this.init();
    this.prepare();
    this.split();
    this.schedule();
}
```

`preCheck()` 会分别初始化 Reader.Job 和 Writer.Job，再调用各自插件实现。对于 MySQLReader、MySQLWriter，最终进入 `CommonRdbmsReader` 与 `CommonRdbmsWriter`。

这比单独测试数据源有价值，因为检查使用的是整份任务配置。JDBC URL、账号、表、列、`querySql`、`splitPk`、`preSql` 和 `postSql` 都进入同一条验证链路。

但它仍然是预检，不是一次完整同步。把 dryRun 成功写成“任务可运行”，同样会过度承诺。

## Reader 预检会执行第一条真实查询

RDBMS Reader 的 `preCheck()` 为每个 connection 配置创建 `PreCheckTask`，线程池最多 10 个并发。任务先通过 `DBUtil.sqlValid()` 解析 SQL，然后对每个 connection 的第一条 `querySql` 做真实查询。

```java
DBUtil.sqlValid(querySql, dataBaseType);
if (i == 0) {
    rs = DBUtil.query(conn, querySql, fetchSize);
}
```

这一步能抓到不少“连接成功但任务必然失败”的问题：库表不存在、字段写错、查询权限不足、数据库不接受生成后的 SQL。

切分键也有单独预检。Reader 会构造 splitPk SQL，做语法校验，并在第一个查询上执行 `precheckSplitPk()`。所以 dryRun 还可以提前发现切分列不可用，而简单建连完全碰不到这一层。

边界也很清楚。多条 `querySql` 会全部经过解析器，但源码只执行索引为 0 的那条真实查询。后续 SQL 若在数据库方才暴露问题，预检可能放过。查询只取很小的 fetchSize，也不会模拟百万行结果、慢 SQL、服务端游标和长连接。

另一个需要谨慎的点是“真实查询”。如果用户在 `querySql` 中放了昂贵的视图或无分区条件的大表扫描，dryRun 也可能给源库制造负载。预检接口要有超时和并发限制，不能因为名字里有 dry 就当它没有成本。

## Writer 预检检查权限，但不会写一批真实数据

`CommonRdbmsWriter.writerPreCheck()` 做两类事情：解析 `preSql`、`postSql`，检查 INSERT 和必要时的 DELETE 权限。

MySQL/Oracle 的 INSERT 权限检查会执行一条零行插入：

```sql
insert into target_table
select * from target_table where 1 = 2
```

DELETE 权限检查类似：

```sql
delete from target_table where 1 = 2
```

DELETE 只有在 `preSql` 或 `postSql` 以 `DELETE` 开头时才检查。`preSql`、`postSql` 本身在这条预检路径里只走 SQL 解析，不会按生产语义实际执行。

零行 DML 比查询权限更接近 Writer 的真实要求，仍然覆盖不了下面这些问题：

- 任务指定列与目标字段类型是否能接收真实值；
- 批量提交时是否触发唯一键冲突、锁等待或事务日志压力；
- `replace`、`update` 等写入模式是否符合表上的主键设计；
- 实际 `preSql` 清理数据时会不会扫描过大或与在线事务冲突；
- 连接运行数小时后是否被数据库、代理或防火墙回收。

因此 Writer 预检适合挡住确定性配置错误，不适合替代一次受控样本写入。

## 为什么真实任务仍然可能在几小时后断掉

短连接通过后，长任务还会遇到另一组变量。

数据库或代理可能配置连接最大生命周期、空闲超时和服务端游标限制。Reader 查询慢时，网络设备会把长时间没有数据包的连接当作空闲连接清理。Writer 批次太大，又可能在提交阶段超过 socket timeout。

字符集、时区和数值精度也往往要等真实记录出现才暴露。`select 1` 没有中文、零日期、超长 decimal 和大字段，自然验证不到它们。

多 connection 配置还会带来差异。预检按每个 connection 建立连接，但一份任务里的多条 SQL 未必全部执行；主库测试正常，不代表另一个分片地址、只读副本或路由规则完全一致。

我会在发布前增加一条“小样本链路”：使用和生产相同的 Reader、Transformer、Writer，限制主键范围或分区，只同步一批可回滚记录。它不是压测，目标是让字段值真正经过序列化、转换、批量写和提交。

## 平台上的测试结果要能还原

只保存一个布尔值没有诊断价值。一次测试至少应该记录：

```text
测试时间与发起人
数据源配置版本（密码只留密文版本号）
执行节点与网络出口
JDBC 驱动及版本
检查层次：connect / reader preCheck / writer preCheck / sample run
每一层耗时和原始错误码
```

执行节点尤其重要。浏览器访问平台后端测试成功，不代表生产 Worker 所在网络能连到数据库；用控制面节点做测试，再让数据面节点跑任务，是很常见的误判。

我通常要求最终发布校验必须从真实执行池发起。页面可以先做快速连接测试，让用户及时发现账号密码错误；发布时再用完整任务配置跑 dryRun 和小样本。两次测试解决的问题不同，不能互相替代。

“测试连接成功”最准确的翻译应该是：这次从某个节点，用某个配置版本，完成了某个深度的检查。把范围说清楚以后，绿色标记才不会成为后续排障的干扰项。

## 对照源码

- [`DBUtil.testConnWithoutRetry()`：普通连接测试的实际范围](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/plugin-rdbms-util/src/main/java/com/alibaba/datax/plugin/rdbms/util/DBUtil.java#L583-L628)
- [`JobContainer.start()`：dryRun 与正式执行分支](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/job/JobContainer.java#L91-L128)
- [`CommonRdbmsReader.preCheck()`：并发检查 connection 配置](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/plugin-rdbms-util/src/main/java/com/alibaba/datax/plugin/rdbms/reader/CommonRdbmsReader.java#L61-L98)
- [`PreCheckTask.call()`：真实查询与 splitPk 检查](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/plugin-rdbms-util/src/main/java/com/alibaba/datax/plugin/rdbms/reader/util/PreCheckTask.java#L41-L99)
- [`CommonRdbmsWriter.writerPreCheck()`：SQL 与写入权限检查](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/plugin-rdbms-util/src/main/java/com/alibaba/datax/plugin/rdbms/writer/CommonRdbmsWriter.java#L47-L84)
- [`DBUtil.checkInsertPrivilege()`：零行 INSERT 权限验证](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/plugin-rdbms-util/src/main/java/com/alibaba/datax/plugin/rdbms/util/DBUtil.java#L218-L270)
