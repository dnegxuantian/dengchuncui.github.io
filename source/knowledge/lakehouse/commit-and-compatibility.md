---
wiki: lakehouse-architecture
title: 提交与兼容
permalink: /knowledge/lakehouse/commit-and-compatibility/
description: Apache Iceberg Snapshot 原子提交、并发冲突、行级更新成本与 Reader/Writer 兼容矩阵。
date: 2026-09-02 15:34:00
updated: 2026-09-02 15:34:00
robots: index,follow
sitemap: true
comments: false
---

## 提交的原子点在哪里

- {% post_link 2021-08-21-iceberg-snapshot-commit "Iceberg Snapshot 提交到底原子在哪里" %}
- {% post_link 2026-05-16-lakehouse-concurrent-commit "湖仓并发写入为什么要从提交冲突诊断" %}

Iceberg 的原子点是 Catalog 中 metadata pointer 的切换，不是整个写入过程只发生一次。数据文件和元数据文件通常已经落盘，失败后必须区分可重试冲突、语义冲突和提交状态未知。

## 更新与升级为什么需要单独核算

- {% post_link 2022-02-22-lakehouse-row-update-cost "湖仓表的 UPDATE 为什么比数据库贵" %}
- {% post_link 2022-06-20-table-format-compatibility-matrix "Iceberg 表格式升级前，为什么要做兼容矩阵" %}

行级更新要计算命中的 Data File、Delete File 和后续合并成本；格式升级则必须把 Spark、Flink、Trino、Catalog 和维护任务逐一放进兼容矩阵。
