---
title: "Iceberg Snapshot 提交到底原子在哪里：并发写入、重试与未知状态"
date: "2021-08-21 16:27:09"
updated: "2021-08-21 16:27:09"
categories:
- "湖仓架构"
tags:
- "Apache Iceberg"
- "并发提交"
- "数据湖"
description: "结合 Apache Iceberg 0.12.0 的规范和提交源码，解释 metadata pointer 原子切换、乐观并发、冲突重试、孤儿文件与 commit state unknown。"
cover: /images/articles/iceberg-snapshot-commit.svg
top_img: /images/articles/iceberg-snapshot-commit.svg
permalink: /2021/08/21/iceberg-snapshot-commit/
comments: false
editorial_standard: expert-v1
---

“Iceberg 支持原子提交”这句话很容易被理解成：两个任务同时写同一张表也不会冲突，失败了自动重试就好。实际边界要窄得多。

Iceberg 的原子点是 table metadata pointer 从旧 metadata file 切换到新文件。数据文件、manifest、manifest list 和新 metadata file 在此之前已经写到存储上；只有 catalog 中的指针成功切换，新 snapshot 才对读者可见。两个 writer 基于同一个旧版本提交时，只能有一个先完成切换，另一个必须刷新表状态、重新验证再尝试。

所以原子性解决的是“读者不会看到半张表”，不是“所有并发操作都会成功”。并发 append、overwrite 和 compaction 的冲突条件不同，失败后的处理也不能统一写成一个无限重试。

![Iceberg Snapshot 的乐观并发提交](/images/articles/iceberg-snapshot-commit.svg)

<!-- more -->

## 数据文件先写，提交只切 metadata pointer

Iceberg 不依赖扫描表目录来决定哪些文件属于表。每个 snapshot 通过 manifest list 找到 manifests，再由 manifest 列出 data file 或 delete file。table metadata file 保存 schema、partition spec、properties、snapshot 历史和 current snapshot 引用。

Writer 执行一批 append 时，先写新的 data files，再为它们生成 manifest 和 snapshot metadata。到这一步，文件已经存在于 HDFS 或对象存储，但当前 table metadata 还没有引用它们，正常 reader 不会把它们读进来。

最后一步才是 commit：把 catalog 中指向 base metadata file 的位置，原子地换成 new metadata file。切换成功后，读者下一次 refresh 才能看到新 snapshot。已经基于旧 metadata 开始规划的查询，仍然使用原 snapshot，不需要和 writer 互相加读锁。

这套设计有两个直接结果。

第一，数据文件的 `rename` 不是事务边界。对象存储没有 HDFS 那样的原子 rename，也不妨碍 Iceberg 先把不可变文件写到最终路径，再用 catalog 完成指针切换。第二，表目录里出现一个 Parquet 文件，不代表它已经属于表；反过来，绕开 Iceberg 直接删除目录中的文件，可能删掉历史 snapshot 仍在引用的数据。

我在平台上不会用“目录文件数变化”判断 Iceberg 写入是否成功，而是记录 committed snapshot ID、metadata location、added data files 和 operation summary。

## 两个 Writer 同时提交时发生什么

假设 Writer A 和 Writer B 都从 metadata v10 开始：

```text
A: base=v10 -> 写 data/manifest -> 准备 metadata v11-A
B: base=v10 -> 写 data/manifest -> 准备 metadata v11-B
```

A 先把 catalog pointer 从 v10 切到 v11-A。B 提交时，catalog 当前值已经不是自己的 base v10，commit 必须失败。`BaseMetastoreTableOperations.commit()` 在进到具体 catalog 提交前，就会拒绝本地已经陈旧的 base；Hive 实现拿到 HMS lock 后，还会再次比较 base metadata location 与表当前 `metadata_location`，不同就抛 `CommitFailedException`。

这是 compare-and-swap 的核心：只有“当前仍等于我读到的 base”时，才能把它替换成我的新版本。HMS lock 用来串行化临界区，但正确性仍要靠 base location 比较，不能把“拿到锁”误解成自己的计算结果一定仍然有效。

对于普通 append，B 刷新到 v11-A 后，通常可以把自己已经写好的 manifest 加到新 metadata tree 上再提交。Iceberg 的 manifest 设计允许在重试中复用大部分已写内容，所以冲突不必重新跑整份数据计算。

表面上看，最终历史是 v10 -> v11-A -> v12-B，两个 append 都保留。顺序由成功提交决定，不由任务启动时间决定。

## 重试之前必须重新验证假设

Iceberg 的可靠性文档把 commit 拆成 assumptions 和 actions。冲突发生后，writer 先在新的当前状态上检查假设是否仍成立，再重新应用动作。

Append 的假设通常比较宽：我只增加一批新文件，另一个 writer 同时增加其他文件，二者可以合并。Rewrite/compaction 就不同。假设任务把 `file_a`、`file_b` 重写为 `merged.parquet`，它提交时必须确认 `file_a` 与 `file_b` 仍在当前表中。如果并发任务已经删除或替换其中一个文件，继续提交会把别人的结果覆盖掉，正确动作是失败而不是硬重试。

Overwrite 还需要考虑读写集合。一个动态分区覆盖任务与迟到数据 append 同时发生，是否可以重试，取决于它验证的是目标分区、匹配过滤条件的数据文件，还是某个明确 snapshot 之后没有冲突数据。把所有 `CommitFailedException` 都捕获后 `while(true)`，只是绕开了 API 想保护的隔离语义。

`SnapshotProducer.commit()` 只对 `CommitFailedException` 按配置做指数退避重试。每次 `apply()` 都会 refresh base 并重新运行子操作的 validation。这个顺序很重要：不是拿同一个 metadata 文件反复写 catalog，而是在新 base 上重新构造待提交 snapshot。

我会按操作类型分别统计 commit conflict。Append 的偶发冲突可以重试；同一分区上的高频 overwrite、delete、compaction 冲突，说明调度和维护策略互相踩踏，需要从任务编排上错开。

## 提交失败和提交状态未知不是一回事

Catalog 返回确定的 compare-and-swap 失败时，writer 知道新 metadata 没有成为表状态，可以清理这次未提交的 metadata 文件，并按规则重试。

更难处理的是网络超时：请求可能已经在 HMS 或其他 catalog 中成功，客户端只是在响应返回前断开。此时再盲目提交一次，可能重复 append；立即删除新 metadata 或 data file，又可能破坏一笔已经成功的提交。

Iceberg 0.12.0 为此保留 `CommitStatus.UNKNOWN`。`BaseMetastoreTableOperations.checkCommitStatus()` 会 refresh 表，检查本次 new metadata location 是否是当前 metadata，或是否出现在 previous metadata history 中。之所以还要查 history，是因为本次提交成功后，另一个 writer 可能已经在它上面又提交了一版。

如果多次检查仍无法判断，应该抛出 `CommitStateUnknownException`，把任务停在“需要确认”的状态，而不是自动宣布失败。运维页面也应该把 FAILED 与 UNKNOWN 分开：

| 状态 | 可以采取的动作 |
| --- | --- |
| 明确 commit failed | 刷新 base，重新验证，按操作语义重试 |
| 明确 commit succeeded | 记录 snapshot ID，进入下游验证 |
| commit state unknown | 查询 metadata history；未确认前不重复写、不删文件 |

这类状态是分布式提交的正常边界，不是一个可以用“重试三次”隐藏掉的异常文案。

## 失败会留下文件，清理不能追着任务跑

新 snapshot 可见之前，writer 已经产生 data file、manifest list 和 metadata file。冲突重试可以复用一部分文件，也会生成新的 manifest list；确定失败后，Iceberg 会尝试清理未使用的 metadata，但清理本身也可能失败。

因此表目录出现 orphan file 并不意外。危险的是写一个定时脚本，把“最近没有被当前 snapshot 引用”的文件全部删除。历史 snapshot 可能还在引用，长时间运行的 reader 也可能仍基于旧 snapshot 读取。文件是否可删要结合 snapshot expiration 和可达性判断，并给正在运行的任务留出安全时间窗。

相反，snapshot expiration 也不等于马上删除所有数据。规范说明，文件可以在最后一个把它作为 live data 的 snapshot 被回收后删除；实际检测和删除还要考虑失败重试与存储一致性。维护任务需要单独的审计记录：过期了哪些 snapshot、计划删哪些文件、实际删成功多少、失败列表在哪里。

我会把 commit 与 maintenance 分成两条链路。在线 writer 负责正确生成并提交 snapshot，不在提交热路径上做大范围目录扫描；维护任务负责 expire snapshots、remove orphan files 和 manifest rewrite，并避开正在进行的 overwrite/compaction。

## 运维上要盯的是提交链路，不只是数据量

一张 Iceberg 表写得慢，可能慢在生成 data file，也可能卡在 catalog lock、metadata refresh、manifest merge 或 commit 重试。只看 Spark/Flink task 是否结束，不能判断表状态是否已经切换。

我会为每次写入保存这些证据：base snapshot ID、attempt 次数、每次失败原因、新 snapshot ID、metadata location、added/deleted file count、catalog commit 耗时，以及最终 commit status。状态未知时，再保存检查到的 current/previous metadata locations。

并发治理也要按表和分区做。某张表一天出现一两次 append conflict，重试很快成功，通常可以接受；每轮 compaction 都与实时 append 冲突，说明维护窗口或隔离条件设计有问题。继续放大重试次数会增加 metadata 文件与 catalog 压力，不能解决操作假设本身互斥。

Iceberg 原子提交真正提供的是一条清晰的可见性边界：pointer 切换前，读者看旧 snapshot；切换后，读者可以看到完整的新 snapshot。围绕这条边界，平台还要正确处理冲突、未知状态、孤儿文件和历史清理。少了这些，原子性只是一句听起来很安全的宣传语。

## 对照源码与文档

- [Iceberg 0.12.0 Reliability：metadata pointer 原子切换与 snapshot 可靠性](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/site/docs/reliability.md#L18-L33)
- [Iceberg 0.12.0 Reliability：乐观并发、重试与冲突验证](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/site/docs/reliability.md#L42-L60)
- [Iceberg 0.12.0 Spec：metadata file、snapshot、manifest 的关系](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/site/docs/spec.md#L43-L63)
- [`BaseMetastoreTableOperations.commit()`：拒绝 stale table metadata](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/core/src/main/java/org/apache/iceberg/BaseMetastoreTableOperations.java#L113-L130)
- [`SnapshotProducer.commit()`：仅对 CommitFailedException 重新 apply 与提交](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/core/src/main/java/org/apache/iceberg/SnapshotProducer.java#L269-L307)
- [`HiveTableOperations.doCommit()`：HMS lock 下比较 base metadata location](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/hive-metastore/src/main/java/org/apache/iceberg/hive/HiveTableOperations.java#L203-L243)
- [`checkCommitStatus()`：从 current 与 previous metadata 判断未知提交结果](https://github.com/apache/iceberg/blob/7ca1044655694dbbab660d02cef360ac1925f1c2/core/src/main/java/org/apache/iceberg/BaseMetastoreTableOperations.java#L266-L312)
