---
title: "Iceberg 快照解决的是可追溯提交"
date: "2021-08-21 10:14:26"
updated: "2021-08-21 10:14:26"
categories:
- "湖仓架构"
tags:
- "Iceberg"
- "快照"
- "湖仓"
description: "表格式的价值不在于给文件加一层目录，而在于把一次写入变成可校验、可回滚的原子提交。 当表能回答某批数据由谁、何时、基于哪个快照写入，湖仓才具备工程意义。"
cover: /images/timeline/iceberg-snapshot-commit.svg
top_img: /images/timeline/iceberg-snapshot-commit.svg
permalink: /2021/08/21/iceberg-snapshot-commit/
comments: false
---

<!-- generated: timeline-backfill -->

表格式的价值不在于给文件加一层目录，而在于把一次写入变成可校验、可回滚的原子提交。

![Iceberg 快照解决的是可追溯提交](/images/timeline/iceberg-snapshot-commit.svg)

## 先看边界

> 数据文件写完不等于提交成功，读者只应看到元数据指针已经切换的快照。

- 快照保留策略要同时考虑追溯窗口和元数据膨胀，不能长期只增不清。
- 并发写入的冲突要按分区和操作类型处理，盲目重试可能覆盖另一批作业的判断。

## 落地时我会盯住什么

当表能回答某批数据由谁、何时、基于哪个快照写入，湖仓才具备工程意义。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
