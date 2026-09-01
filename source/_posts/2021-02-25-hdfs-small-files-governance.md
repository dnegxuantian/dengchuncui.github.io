---
title: "小文件治理不能只靠定时合并"
date: "2021-02-25 10:15:05"
updated: "2021-02-25 10:15:05"
categories:
- "分布式系统"
tags:
- "HDFS"
- "小文件"
- "存储治理"
description: "HDFS 小文件问题表面是 NameNode 元数据压力，根上通常是分区粒度、写入并发和提交策略失控。 治理小文件的正确顺序是停止制造、控制增量、最后处理存量。"
cover: /images/timeline/hdfs-small-files-governance.svg
top_img: /images/timeline/hdfs-small-files-governance.svg
permalink: /2021/02/25/hdfs-small-files-governance/
comments: false
---

<!-- generated: timeline-backfill -->

HDFS 小文件问题表面是 NameNode 元数据压力，根上通常是分区粒度、写入并发和提交策略失控。

![小文件治理不能只靠定时合并](/images/timeline/hdfs-small-files-governance.svg)

## 先看边界

先按表统计文件数、平均大小和每日增量，找出持续制造小文件的任务，而不是全库扫一遍合并。

### 实施时

- 实时写入要控制并发 sink 数和滚动策略；离线写入则优先调整分区与 reducer 数量。
- 合并任务必须与读写隔离，并记录替换前后的快照，否则故障回滚会变成手工找文件。

## 落地时我会盯住什么

治理小文件的正确顺序是停止制造、控制增量、最后处理存量。

### 延伸资料

- [Apache Hadoop Documentation](https://hadoop.apache.org/docs/stable/)
