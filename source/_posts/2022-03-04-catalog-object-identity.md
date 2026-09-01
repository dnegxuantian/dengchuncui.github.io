---
title: "统一 Catalog 之前先统一对象标识"
date: "2022-03-04 13:33:28"
updated: "2022-03-04 13:33:28"
categories:
- "数据治理"
tags:
- "Catalog"
- "元数据"
- "对象标识"
description: "多个引擎接入统一 Catalog 时，最先冲突的通常不是接口，而是同一张表在不同系统里的名字并不相同。 统一 Catalog 的基础不是把所有表列出来，而是让每个对象在生命周期内保持可识别。"
cover: /images/timeline/catalog-object-identity.svg
top_img: /images/timeline/catalog-object-identity.svg
permalink: /2022/03/04/catalog-object-identity/
comments: false
---

<!-- generated: timeline-backfill -->

多个引擎接入统一 Catalog 时，最先冲突的通常不是接口，而是同一张表在不同系统里的名字并不相同。

![统一 Catalog 之前先统一对象标识](/images/timeline/catalog-object-identity.svg)

## 别急着换组件

对象标识应包含环境、数据源、命名空间和稳定 ID，展示名只用于检索。

## 实施顺序

- 别名、物理位置和引擎内标识要分开保存，迁移存储路径时才能保持资产身份不变。
- 删除与重建不能复用旧 ID，否则历史血缘和权限会错误地挂到新对象上。

统一 Catalog 的基础不是把所有表列出来，而是让每个对象在生命周期内保持可识别。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
