---
title: "Debezium MySQL CDC 全量快照与增量 Binlog 怎么衔接：一致性边界在哪里"
date: "2021-07-16 19:36:22"
updated: "2021-07-16 19:36:22"
categories:
- "数据同步"
tags:
- "CDC"
- "Debezium"
- "MySQL"
description: "从 Debezium 1.6.0.Final 的 MySQL 快照流程解释全量与 Binlog 增量如何衔接，以及锁、offset、DDL、日志保留和下游幂等的边界。"
cover: /images/articles/cdc-consistency-boundary.svg
top_img: /images/articles/cdc-consistency-boundary.svg
permalink: /2021/07/16/cdc-consistency-boundary/
comments: false
editorial_standard: expert-v1
---

CDC 任务第一次启动，通常要先把表里已有的数据读出来，再持续消费 Binlog。产品页面上这件事常被简化成两个阶段：全量完成，切到增量。真正的一致性问题恰好藏在“切”这个字里。

全量扫描可能持续几个小时，这期间业务仍在 INSERT、UPDATE、DELETE。先扫表、扫完以后再记 Binlog 位点，会漏掉扫描期间的变化；先记位点、等全量全部写完再读 Binlog，又必须保证这段日志不会被清理，而且下游能正确处理快照记录与后续变更。

Debezium 1.6.0.Final 的 MySQL connector 给出了一个可读的实现：在短暂锁定期间建立 repeatable read 事务，记录 Binlog 位点和表结构，然后释放全局读锁，在同一一致性视图里继续扫描表。这个位点才是全量与增量的边界。

![Debezium MySQL 初始快照与 Binlog 衔接](/images/articles/cdc-consistency-boundary.svg)

<!-- more -->

## 边界是一个位点，不是一个完成时间

MySQL Binlog 按事务提交顺序记录数据和 schema 变化。Debezium 初次启动时先做 consistent snapshot，之后从快照对应的 Binlog 位置继续读取。

这个位置可以理解为时间线上的 P。快照事务读取的是 P 对应的一致性视图；P 之后提交的变化进入 Binlog，由增量阶段回放。只要这两个条件同时成立，扫描表花多长时间都不会凭空制造一个未覆盖区间。

这里最容易写错的是把“全量任务结束时间”当成 P。假设 10:00 开始扫表、12:00 扫完，如果增量从 12:00 的位置开始，10:00 到 12:00 之间已经提交的更新可能既不在早先扫过的行里，也不在增量范围内。一个看似连续的任务，实际缺了两小时。

P 也不能只保存在运行日志。Debezium 会把快照状态和 Binlog 位置放进 connector offset。任务重启后，是否继续增量、是否重新快照，取决于持久化 offset，而不是页面上曾经显示过“全量成功”。

我设计 CDC 平台时，会把 source offset 当成任务结果的一部分展示和审计。对于非 GTID 模式，至少包括 Binlog filename、position 和 row；使用 GTID 时，还要保留 GTID 集合。只有一个“已同步到 99%”的进度条，无法证明边界在哪里。

## 全局读锁只覆盖确定边界的短阶段

Debezium 默认 initial snapshot 的流程有明确顺序：

1. 获取 global read lock，阻止其他客户端写入；
2. 开启 repeatable read 事务；
3. 读取当前 Binlog position；
4. 读取需要捕获的表结构；
5. 释放 global read lock；
6. 在一致性事务中扫描表并发送 snapshot event；
7. 提交事务，记录快照完成状态。

锁的目的不是覆盖整个大表扫描，而是让 Binlog 位点、schema 和一致性视图在同一个边界上建立起来。源码中 `determineSnapshotOffset()` 执行 `SHOW MASTER STATUS`，保存 Binlog 文件名、位置和可用的 GTID set；`releaseSchemaSnapshotLocks()` 在 minimal locking 模式下随后释放全局锁。

这也是为什么不能从“全量扫描需要三小时”直接推断“业务写入会被锁三小时”。全局锁持有多久，要看获取锁、建立事务、读取位点和 schema 的耗时。它仍然会影响在线写入，所以要监控等待锁时间与实际持锁时间，选择业务可接受的窗口。

某些托管 MySQL 不允许 global read lock，Debezium 会退到 table-level lock，并要求 `LOCK TABLES` 权限。源码还说明了一个麻烦：显式 table lock 场景下，过早 `UNLOCK TABLES` 会隐式提交活动事务，破坏 consistent snapshot，因此锁释放边界和全局锁不同。上线前只测试 SELECT 与 REPLICATION 权限并不够。

## 快照期间发生的更新为什么不会丢

假设账户 42 在 P 时余额为 100。快照事务读到它时，业务已经在 P 之后把余额更新为 80。CDC 输出会包含一条 snapshot read event（余额 100），随后从 Binlog 读到 update event（100 -> 80）。

这两条记录都应该存在。第一条建立 P 时刻的基线，第二条把状态推进到 P 之后。若下游按主键维护最新状态，最终余额是 80；若下游只做无主键 append，又把两条都解释成当前行，就会看见所谓“重复数据”。问题不在 source 多发了一条，而在 sink 没有实现变更语义。

DELETE 更能暴露这个边界。一行在 P 时存在，快照会输出它；P 之后删除，Binlog 再输出 delete。下游若忽略 delete，只会留下幽灵记录。用“全量行数等于目标行数”做最终验收也会误报，因为校验时刻已经发生新的业务事务。

我会先定义下游语义，再谈不重不丢：

- 镜像表按业务主键 upsert，并能处理 delete；
- 事件明细表保留 operation、source offset 与事务信息；
- 消费失败重试时，用稳定 event identity 去重；
- 校验指定同一个 Binlog/GTID 水位，不拿两个不同时间的表直接比较。

Debezium 的 source metadata 带有 Binlog 文件、位置、row、snapshot 标记等字段，可以用来追踪顺序和识别重放。只拿业务主键做事件去重也不对，同一主键本来就可以连续更新多次。

## 故障恢复保证的是不漏，可能会重放

Debezium 文档对异常场景说得很坦白：正常运行和谨慎管理时可以做到每条变更一次；发生故障并恢复时，可能重复部分 change event，此时是 at-least-once。

Kafka Connect 进程突然退出，最近处理的 offset 可能还没来得及持久化。替代 task 从上一次已提交 offset 恢复，会再次生成崩溃前已经发过的一段事件。这不是随机重复，而是“数据已输出、位点未提交”这个故障窗口的必然结果。

初始快照也有自己的恢复边界。文档说明，快照过程中 connector 停止、失败或 rebalance，重启后会重新做一遍 initial snapshot。下游若直接 append，第二次快照会把基线再写一次。消费端必须把 snapshot read 当成可覆盖的当前值，或者用 source identity 保证幂等。

因此我不会把 source connector 的 exactly-once 宣传成整条链路的 exactly-once。source 读取、Kafka 写入、消费者处理、目标端提交是不同事务域。只有每一段的 offset 和数据提交能形成可恢复关系，端到端语义才成立。

## Binlog 保留期决定最长恢复窗口

Connector 从持久化位点恢复的前提，是 MySQL 还保留那个位置之后的 Binlog。任务停止时间超过日志保留期，旧文件被 purge，位点即使还在也无法继续读取。

Debezium 的 `snapshot.mode=when_needed` 在没有 offset，或原 offset 指向的 Binlog/GTID 已不可用时，会重新执行 snapshot。这个行为可以让任务重新启动，却意味着大表再次全量扫描、目标端再次接收 snapshot event。若下游没有幂等能力，自动恢复会把数据问题放大。

保留期应该从恢复目标反推：允许任务最长停止多久，故障发现需要多久，人工处理与补容量需要多久，全量重做又需要多久。只按磁盘大小设置一个很短的 expire 时间，会让一次普通停机变成强制全量。

监控上我至少保留 source 最新位点、MySQL 最早可用位点、两者之间的时间或字节余量。看到 connector lag 还不够，真正危险的是“剩余可恢复窗口”正在变成零。

## DDL 与数据必须沿同一时间线解释

Binlog 不只记录行变化，也记录 DDL。Connector 处理一条旧的 row event 时，不能直接使用数据库当前 schema，因为这条事件可能产生在 ALTER TABLE 之前。

Debezium 将 DDL 与其 Binlog 位置写入 database history topic。重启到某个 offset 时，它回放这个位置以前的 DDL，重建当时的表结构。这个 history topic 是 connector 自用状态，不能把它当成可随时重建的普通日志；文档还要求保证全局顺序，topic partition 数必须为 1。

这解释了另一个常见现象：数据 topic 还在，schema history 丢了，connector 仍可能无法从旧 offset 正确恢复。CDC 备份不能只备业务事件 topic，还要把 connector config、offset 和 schema history 放在一起。

我验收全量转增量时，会做一次受控变更：在快照扫描过程中，对已扫描和未扫描范围各做一组 INSERT、UPDATE、DELETE，记录提交事务与 Binlog 位置；快照完成后检查目标状态，再重启 connector 验证是否重放、是否幂等。这个实验比盯着“全量完成”四个字更接近一致性本身。

## 对照源码与文档

- [Debezium 1.6 MySQL connector：初始 consistent snapshot 与 Binlog 的关系](https://github.com/debezium/debezium/blob/c8c5fc4b56bd53b8cdf8a3aa3ca2a9efec26be73/documentation/modules/ROOT/pages/connectors/mysql.adoc#L27-L34)
- [Debezium 1.6 MySQL snapshot：全局锁、位点、schema 与表扫描顺序](https://github.com/debezium/debezium/blob/c8c5fc4b56bd53b8cdf8a3aa3ca2a9efec26be73/documentation/modules/ROOT/pages/connectors/mysql.adoc#L297-L344)
- [`MySqlSnapshotChangeEventSource.determineSnapshotOffset()`：读取 Binlog 文件、位置与 GTID](https://github.com/debezium/debezium/blob/c8c5fc4b56bd53b8cdf8a3aa3ca2a9efec26be73/debezium-connector-mysql/src/main/java/io/debezium/connector/mysql/MySqlSnapshotChangeEventSource.java#L255-L289)
- [`releaseSchemaSnapshotLocks()`：全局锁与表级锁的不同释放边界](https://github.com/debezium/debezium/blob/c8c5fc4b56bd53b8cdf8a3aa3ca2a9efec26be73/debezium-connector-mysql/src/main/java/io/debezium/connector/mysql/MySqlSnapshotChangeEventSource.java#L199-L220)
- [Debezium 1.6 MySQL schema history：按 Binlog 位置恢复历史 schema](https://github.com/debezium/debezium/blob/c8c5fc4b56bd53b8cdf8a3aa3ca2a9efec26be73/documentation/modules/ROOT/pages/connectors/mysql.adoc#L105-L117)
- [Debezium 1.6 故障语义：恢复期间可能重放事件](https://github.com/debezium/debezium/blob/c8c5fc4b56bd53b8cdf8a3aa3ca2a9efec26be73/documentation/modules/ROOT/pages/connectors/mysql.adoc#L2654-L2662)
- [Kafka Connect 崩溃后从旧 offset 恢复会产生重复事件](https://github.com/debezium/debezium/blob/c8c5fc4b56bd53b8cdf8a3aa3ca2a9efec26be73/documentation/modules/ROOT/pages/connectors/mysql.adoc#L2702-L2714)
