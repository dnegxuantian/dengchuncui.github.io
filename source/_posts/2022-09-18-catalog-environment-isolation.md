---
title: "多环境 Catalog 必须隔离提交权限"
date: "2022-09-18 10:05:46"
updated: "2022-09-18 10:05:46"
categories:
- "数据治理"
tags:
- "Catalog"
- "权限"
- "环境隔离"
description: "测试环境能看到生产表不一定危险，能向生产 Catalog 提交元数据才是真正的边界破坏。 湖仓权限的核心对象是一次提交，不只是某个目录能不能读写。"
cover: /images/timeline/catalog-environment-isolation.svg
top_img: /images/timeline/catalog-environment-isolation.svg
permalink: /2022/09/18/catalog-environment-isolation/
comments: false
---

<!-- generated: timeline-backfill -->

测试环境能看到生产表不一定危险，能向生产 Catalog 提交元数据才是真正的边界破坏。

![多环境 Catalog 必须隔离提交权限](/images/timeline/catalog-environment-isolation.svg)

## 把问题拆开

> 存储读写权限与 Catalog 提交权限分开授予，避免拿到对象存储账号就能替换表指针。

- 环境标识进入 Catalog 命名空间和审计日志，不能只靠集群名称约定。
- 跨环境复制使用显式发布流程，保留源快照与目标快照映射。

## 验收标准

湖仓权限的核心对象是一次提交，不只是某个目录能不能读写。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
