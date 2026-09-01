---
title: "表维护任务为什么也要进入 SLA：小文件、快照和孤儿文件都是运行负债"
date: "2026-05-18 13:21:40"
updated: "2026-05-18 13:21:40"
categories:
- "湖仓架构"
tags:
- "Apache Iceberg"
- "表维护"
- "SLA"
description: "把 Iceberg 小文件合并、Manifest 重写、快照过期和孤儿文件清理纳入平台 SLA，用数据驱动触发、并发隔离、安全保留和结果验证管理运行负债。"
cover: /images/articles/table-maintenance-sla.svg
top_img: /images/articles/table-maintenance-sla.svg
permalink: /2026/05/18/table-maintenance-sla/
comments: false
editorial_standard: expert-v1
---

湖仓表“每天数据都写成功”，不代表它运行健康。流式任务持续产生小文件，快照和 manifest 逐渐膨胀，失败作业留下未引用文件。查询开始变慢、Catalog 元数据增大时，团队才临时跑一次全表 compaction。

这种做法把表维护当清洁脚本，实际上它和写入、查询一样是持续服务。维护延迟会积累运行负债，维护过猛又会抢资源、制造提交冲突甚至误删在途文件。它需要自己的 SLI、SLO、容量和变更治理。

![湖仓表维护 SLA 闭环](/images/articles/table-maintenance-sla.svg)

<!-- more -->

## 不同维护任务解决不同负债

Rewrite data files 合并小文件，改善文件打开、扫描并行度和元数据规模；rewrite manifests 调整 manifest 组织，减少规划阶段读取；expire snapshots 缩短历史链并删除不再引用的数据；remove orphan files 清理从未进入有效 metadata 的残留。

四者不能用一个“Optimize”按钮替代。Compaction 生成新 snapshot，也会增加提交和临时空间；快照过期影响 time travel 与回滚窗口；孤儿清理要扫描存储并承担误删风险；manifest rewrite 的收益取决于分区和查询过滤。

我会为每张表记录 maintenance profile：写入模式、目标文件大小、查询热点、快照保留、最大作业时长、流式 checkpoint/commit 频率、分支/tag 使用、存储路径规范和业务恢复要求。

Profile 由表等级模板继承，再允许少量显式覆盖。让每个团队随手填写十几个参数，最后只会得到无法治理的配置森林。

## SLI 要反映用户感受到的退化

小文件 SLI 不只看平均大小。P50 很正常时，长尾分区可能有几万文件。按活跃分区统计 file count、bytes/file 分位、delete file ratio，以及最近 N 个 snapshots 新增文件速率。

元数据 SLI 包括 manifest count/bytes、planning latency、metadata JSON 数量、snapshot count/age。查询侧结合 file open 数、scan planning time、实际扫描文件与数据量。仅用存储成本无法解释用户为什么查询慢。

清理 SLI 看 oldest eligible snapshot、expired-but-not-deleted files、orphan candidate age/bytes、last successful run 和连续失败次数。候选不等于可安全删除，指标名称要避免让运维误解。

SLO 可以写成：P1 表活跃分区小文件负债在 6 小时内回落，快照保留满足至少 7 天且不少于 N 个，规划延迟不超过基线，orphan 候选在安全窗口后 72 小时内清理。具体值来自业务而不是主题默认值。

## 触发应该由数据和预算共同决定

固定每天凌晨跑全表简单，但流量增长后容易撞上业务高峰，也会反复扫描没有变化的分区。我倾向用 commit count、new file count/bytes、partition heat、manifest growth 和最大间隔共同触发。

Compaction 先选候选文件组，限制单次 rewrite bytes、分区数、并发和运行时。大的积压分批完成并记录 partial progress，避免一次超大任务失败后全部重来。收益低于最小阈值的文件组不重写。

维护调度器要有 per-table lock 或协调机制，同类动作串行，和业务 writer 使用不同优先级/资源池。全局再设 IO、CPU、Catalog commit 与对象存储请求预算，防止几千张表整点同时启动。

失败退避基于原因。提交竞争可换窗口或缩小 rewrite group；读取文件失败先查存储；权限和路径问题不会靠重试恢复。连续失败使表进入 degraded，并把积压增长纳入告警。

## 快照过期先保护所有有效引用

Expire snapshots 前要识别 branches、tags、审计/回滚窗口和仍在运行的 reader。按时间删除但保留最近 N 个，避免低频表一次清空可用历史。表级删除操作也应经过审批和 dry-run 统计。

数据文件只有在不再被任何有效 snapshot 引用后才可删除。分支或 tag 长期固定在旧 snapshot，会让文件无法回收；这不是清理器失效，而是保留策略的真实成本。平台应把持有者和预计空间显示出来。

流式高频提交会产生大量 metadata JSON。自动删除旧 metadata 前确认实现只删除 metadata log 中安全可回收的版本，并保留故障恢复需要的窗口。不要把对象存储 lifecycle 直接套在 metadata 目录上，它看不懂表引用。

维护操作本身生成的 snapshot 也要计入节奏。频繁小 compaction 可能比原始小文件问题制造更多元数据，调度阈值必须用运行结果校准。

## Orphan 清理是最危险的一步

Orphan 的定义是存储里存在、但当前可达 metadata 中没有引用的文件。正在运行但尚未提交的 writer 也符合这个表面特征。因此最小文件年龄必须长于最长合法写入、重试、审批和提交恢复窗口，并留足时钟/队列余量。

路径字符串必须规范一致。Catalog metadata 记录 `s3://bucket/path`，文件系统列表返回另一 authority 或编码形式，差异可能把所有有效文件判成 orphan。正式删除前先输出候选清单，抽样与引用集合对照。

我会采用 mark-and-sweep：第一轮只标 candidate 与发现时间，第二轮在保留期后重新计算引用，仍未引用且没有 active writer lease 才批量删除。每批记录 manifest、大小、结果和失败项，支持停止，但不假装对象存储删除可轻松回滚。

跨表共享目录原则上禁止。若历史架构无法避免，orphan 扫描必须覆盖所有引用方，否则按单表视角会误删别人的文件。

## 每次维护都要验证收益和副作用

任务成功后重新读取表当前 snapshot，确认提交存在、源文件不再由新状态使用、输出文件可读、行数/关键聚合与预期一致。Compaction 不应改变业务数据，delete file 重写还要验证删除语义。

记录 before/after：文件数与大小分布、manifest、规划延迟、扫描成本、存储回收、运行资源和提交冲突。没有收益的维护减少频率，收益稳定再推广，不按“任务成功数”考核平台。

当查询 SLA 恢复而维护积压仍高，要看阈值是否过严；当维护指标漂亮但用户查询没改善，瓶颈可能在分区、排序或引擎。表维护是性能治理的一环，不是万能药。

我更愿意把表维护看作湖仓的垃圾回收与索引整理：正常运行必须有，时机和安全边界却不能粗暴。进入 SLA 之后，团队才能在性能、存储、回滚能力和业务写入之间做稳定取舍，而不是等表变慢再救火。

## 对照资料

- [Apache Iceberg Maintenance](https://iceberg.apache.org/docs/latest/maintenance/)
- [Apache Iceberg Flink TableMaintenance](https://iceberg.apache.org/docs/latest/flink-maintenance/)
- [Apache Iceberg Spec：Snapshots 与 Metadata](https://iceberg.apache.org/spec/)
- [Google SRE Workbook：Implementing SLOs](https://sre.google/workbook/implementing-slos/)
