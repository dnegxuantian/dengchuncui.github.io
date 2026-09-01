---
title: "Iceberg 接入生产后，真正缺的是表级运维闭环"
date: "2022-09-15 11:36:50"
updated: "2022-09-15 11:36:50"
categories:
- "湖仓架构"
tags:
- "Apache Iceberg"
- "表维护"
- "平台运维"
description: "基于 Apache Iceberg 0.14.1 的 metadata tables 与 Spark procedures，说明生产表如何建立健康指标、保留策略、维护动作、删除证据和持续验收。"
cover: /images/articles/iceberg-operations-loop.svg
top_img: /images/articles/iceberg-operations-loop.svg
permalink: /2022/09/15/iceberg-operations-loop/
comments: false
editorial_standard: expert-v1
---

Iceberg 表能被 Spark 和 Flink 正常读写，只能证明接入完成，不能证明可以长期运行。流式任务每天产生几百个 snapshots，小批写入不断增加 data files，失败任务留下 orphan files，time travel 保留策略又阻止旧文件回收。三个月后，表仍能查，但规划越来越慢，存储账单一直涨，维护脚本谁也不敢改。

我认为平台真正要补的是表级运维闭环：从 metadata tables 读取健康信号，按每张表的负载和 SLA 选择维护动作，记录提交与删除证据，再验证查询和成本是否改善。它不是几条全局 cron，而是和写入一样正式的生产链路。

![Iceberg 表从元数据体检到读写验收的运维闭环](/images/articles/iceberg-operations-loop.svg)

<!-- more -->

## 先把 Metadata Tables 变成可持续指标

Iceberg 0.14.1 能通过 `history`、`snapshots`、`files`、`manifests`、`partitions` 等 metadata tables 检查表状态。它们不是只在排障时手工查询的系统表，更适合作为表健康采集源。

我会按日或小时采集一份不可变快照，至少包含：current snapshot ID、snapshot age、24 小时提交次数、operation 分布、data/delete file 数量与字节、文件 size 分位数、manifest 数量、partition record/file count。采集结果带 table UUID 与 metadata location，防止同名重建后把两代数据接在一起。

指标要保留分布，不能只有平均值。平均文件 256 MB，可能是少量 5 GB 文件加上几万个 1 MB 文件；全表 file count 正常，某个实时热分区却已经挂了大量 delete files。p10/p50/p90 与 per-partition topN 更接近实际维护需求。

`all_data_files`、`all_manifests` 这类跨 snapshot 表会出现同一文件被多个 snapshot 引用，不能直接 `count(*)` 当物理文件数。采集逻辑要理解 metadata table 语义，区分 current state、historical reachability 与存储 listing。

## 不同债务要由不同动作偿还

Iceberg 的维护动作各自处理不同对象。

`rewrite_data_files` 用来改善数据文件尺寸或排序，解决 file open、delete merge 和扫描布局。`rewrite_manifests` 调整 metadata tree，减少规划时扫描的 manifests，并让 manifest 分组更贴近查询过滤。`expire_snapshots` 移除过期历史引用，控制 metadata 和 time travel 窗口。`remove_orphan_files` 查找根本没被 metadata 引用的文件。

把它们打包成一个“优化表”按钮，会让失败难以解释。一次 data rewrite 成功、expire 失败、orphan 删除一半，最终到底是什么状态？平台应该把 action、base snapshot、参数、输入候选、输出 snapshot 与删除结果分别记录。

动作顺序也不是固定的。高频流表可能先降低 writer commit 频率，再 compact 热分区，否则刚合并完又产生新碎片；snapshot 积累过多时先 expire 能减少后续可达性扫描，但必须满足 time travel 与长查询窗口；orphan removal 通常最保守，先 dry-run 再删除。

## Retention 是业务恢复能力，不只是省存储

`expire_snapshots` 会让过期 snapshot 不再可用于 time travel 或 rollback。Spark procedure 文档说明，它不会删除仍被非过期 snapshot 需要的文件。安全性边界清楚，但“保留多久”仍然是业务选择。

如果财务表要求可回溯 90 天，而平台统一只保留 7 天，存储省下来了，审计能力也丢了。相反，流式临时明细没有回滚需求却永久保留 snapshot，会让 metadata 和文件引用不断增长。

我会给表定义三项：`min_snapshots_to_keep`、`max_snapshot_age` 与 `max_ref_age`，并把分支/tag 引用纳入检查。执行 expire 前输出计划删除的 snapshot IDs、时间范围、仍保留的最老 snapshot 和预计可回收文件数。

长时间运行的 reader 也要考虑。一个 Spark 查询基于旧 snapshot 规划后执行数小时，维护任务若过早 expire 并删除其数据文件，查询会在中途失败。保留窗口至少覆盖最长读任务、写任务和故障恢复时间，再加安全余量。

## Orphan 清理必须先证明“不可达”

分布式写入会先生成 data/manifest/metadata 文件，再提交 table metadata pointer。任务失败或提交冲突后，部分文件可能没有被任何 snapshot 引用，成为 orphan。目录 listing 中“最近没有修改”不能直接等价为可删除。

0.14.1 的 `remove_orphan_files` procedure 提供 `dry_run`，可以先列出候选而不删除。我会强制生产首次执行、路径配置变化和大规模候选时走 dry-run，并把候选清单落审计表。

删除前做三类检查：文件年龄是否大于最长写入/重试窗口；路径 authority、scheme 和规范化结果是否与 metadata 一致；候选是否落在允许的 table location 前缀。任何一项异常都停止，而不是跳过几条继续删。

真正执行后还要记录成功、not found、permission denied 与其他失败。对象存储批量删除返回部分成功时，Job exit 0 不能代表全部完成。下一轮扫描可以重试失败项，但不应丢掉上一次证据。

## 维护服务要与 Writer 协调

Rewrite、expire 与正常 writer 最终都要提交 metadata。不同操作的冲突条件不同，统一做“失败重试三次”只会放大 Catalog 压力。

服务需要知道表的写入模式和窗口。纯 append 表可以在老分区做 data rewrite；活跃分区存在 row-level update 时，rewrite 必须处理有效 delete 并验证并发变化；overwrite 和 compaction 同时改同一批文件，应由调度器错开。

我会为每张表建立 maintenance lease，防止两轮 planner 选到相同文件；同时不给维护任务长期锁住整张表。file groups 独立提交时，每组都记录 base/current snapshot 与 conflict 原因。冲突率高是调度设计信号，不是简单增加重试上限的理由。

维护资源也要有预算。限制每小时 rewrite bytes、并发 file groups、Catalog commits 和 delete requests，业务查询高峰自动降速。表债务可以延迟一轮，线上查询被维护任务拖垮则是直接事故。

## 成功标准必须回到查询和恢复

维护 Job 成功只说明 procedure 执行结束。验收要回答三个问题。

第一，物理结构是否改善：小文件比例、delete-to-data ratio、manifest 数和 snapshot 数是否落到目标区间。第二，查询是否改善：相同 SQL 的 planning time、selected files、scan bytes 和 p95 latency 是否下降。第三，恢复能力是否仍满足：最老可用 snapshot、tag/branch 和回滚演练是否符合策略。

如果 rewrite 处理 10 TB 后，文件数下降但查询扫描量没变，可能排序布局没有贴合过滤条件；如果 expire 执行正常但存储没下降，说明文件仍被其他 refs 引用，或删除失败；如果 manifest rewrite 后 planning 更慢，可能分组破坏了查询局部性。

每个动作都应有 before/after snapshot 与查询对照。平台把这份结果展示给表 owner，owner 才能判断策略值不值得继续，而不是只收到“优化成功”的绿色提示。

## 给表设置状态，而不是等告警爆炸

我会把表健康划为 HEALTHY、DEBT_GROWING、MAINTENANCE_DUE、MAINTENANCE_BLOCKED 和 AT_RISK。状态由具体条件驱动，例如连续三天新增小文件快于 rewrite、snapshot age 超过上限、orphan dry-run 候选异常激增、commit conflict 持续升高。

`BLOCKED` 要带原因：没有删除权限、仍有旧 reader、缺少维护窗口、Catalog commit 不稳定。这样治理工作能进入 owner 的待办，而不是藏在平台后台。

Iceberg 的价值之一，是把表状态显式写在 metadata tree 里。平台如果只把它当新的文件格式，就浪费了这些可诊断证据。接入生产后的重点不是再演示一次 time travel，而是让每张表的提交、文件、快照、保留和维护都有长期可执行的策略。

## 对照源码与文档

- [Iceberg 0.14.1 Spark Queries：history、snapshots、files、manifests 等 metadata tables](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-queries.md#L35-L57)
- [Iceberg 0.14.1 Spark Queries：metadata tables 的访问与跨 snapshot 语义](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-queries.md#L195-L319)
- [Iceberg 0.14.1 Spark Procedures：expire_snapshots 的保留与文件删除边界](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-procedures.md#L191-L225)
- [Iceberg 0.14.1 Spark Procedures：remove_orphan_files 与 dry-run](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-procedures.md#L228-L257)
- [Iceberg 0.14.1 Spark Procedures：rewrite_data_files 的策略、过滤和参数](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-procedures.md#L260-L316)
- [Iceberg 0.14.1 Spark Procedures：rewrite_manifests](https://github.com/apache/iceberg/blob/71d918e781eff70c2c2a21aea7289daad61c8afe/docs/spark-procedures.md#L319-L355)
