---
wiki: lakehouse-architecture
title: 阅读入口
seo_title: 湖仓架构与表维护
description: 邓明瑞关于 Apache Iceberg 原子提交、行级更新、兼容矩阵、Compaction 和表维护 SLA 的技术索引。
date: 2026-09-02 15:33:00
updated: 2026-09-02 15:33:00
robots: index,follow
sitemap: true
comments: false
---

湖仓表接入生产以后，问题会从“能不能读写”迅速转向“能不能长期运行”。Snapshot、Delete File、Manifest、Compaction 和快照清理不是孤立功能，它们共同决定提交正确性、查询成本和运行负债。

## 两条阅读主线

1. [提交与兼容](./commit-and-compatibility/)：理解原子提交、并发冲突、行级更新和格式升级。
2. [维护与治理](./maintenance-and-governance/)：理解小文件、快照、孤儿文件和维护任务 SLA。

先看提交边界，再讨论维护策略。否则很容易把一次语义冲突当成普通失败重试，或者让 Compaction 与在线写入持续互相打架。
