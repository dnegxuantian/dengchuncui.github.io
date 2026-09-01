---
title: "数据契约要约束变化而不是冻结变化"
date: "2022-08-13 17:41:07"
updated: "2022-08-13 17:41:07"
categories:
- "数据治理"
tags:
- "数据契约"
- "Schema"
- "变更管理"
description: "数据契约不是要求上游永远不改字段，而是让下游提前知道什么会变、何时变、如何验证。 能安全演进的契约比一份禁止修改的规范更有生命力。"
cover: /images/timeline/data-contract-change-control.svg
top_img: /images/timeline/data-contract-change-control.svg
permalink: /2022/08/13/data-contract-change-control/
comments: false
---

<!-- generated: timeline-backfill -->

数据契约不是要求上游永远不改字段，而是让下游提前知道什么会变、何时变、如何验证。

![数据契约要约束变化而不是冻结变化](/images/timeline/data-contract-change-control.svg)

## 架构判断

契约至少包含 Schema、主键、更新语义、时效、质量阈值和负责人。

### 实施时

- 兼容变更可以自动检查，不兼容变更必须提供影响清单和双写窗口。
- 契约版本要与真实批次绑定，只有文档版本无法证明某批数据遵循哪份规则。

## 留给运维的答案

能安全演进的契约比一份禁止修改的规范更有生命力。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
