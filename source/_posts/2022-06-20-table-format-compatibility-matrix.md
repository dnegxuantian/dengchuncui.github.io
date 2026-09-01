---
title: "表格式升级前先做引擎兼容矩阵"
date: "2022-06-20 17:28:26"
updated: "2022-06-20 17:28:26"
categories:
- "湖仓架构"
tags:
- "表格式"
- "兼容性"
- "版本升级"
description: "湖仓表格式升级不能只看核心库版本。Spark、Flink、查询引擎和 Catalog 的支持范围往往并不同步。 兼容性不是 Maven 依赖能解析，而是每条关键数据路径都经过真实读写验证。"
cover: /images/timeline/table-format-compatibility-matrix.svg
top_img: /images/timeline/table-format-compatibility-matrix.svg
permalink: /2022/06/20/table-format-compatibility-matrix/
comments: false
---

<!-- generated: timeline-backfill -->

湖仓表格式升级不能只看核心库版本。Spark、Flink、查询引擎和 Catalog 的支持范围往往并不同步。

![表格式升级前先做引擎兼容矩阵](/images/timeline/table-format-compatibility-matrix.svg)

## 别急着换组件

> 矩阵要列出读、写、DDL、行级操作和时间旅行能力，而不是简单标记“支持”。

- 用同一份样本表验证跨引擎写后读，尤其关注时间类型、分区演进和删除语义。
- 升级时保留旧客户端只读窗口，确认新快照不会让旧引擎无法解析后再扩大范围。

## 实施顺序

兼容性不是 Maven 依赖能解析，而是每条关键数据路径都经过真实读写验证。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
