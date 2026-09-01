---
title: "RAG 从 Demo 到平台差的是生命周期"
date: "2024-02-09 16:02:17"
updated: "2024-02-09 16:02:17"
categories:
- "AI 工程"
tags:
- "RAG"
- "内容生命周期"
- "知识库"
description: "Demo 只关心文档能否被搜到，平台必须处理新增、更新、撤回、权限变化和索引失败。 RAG 真正进入生产，是内容变化能稳定传递到答案，而不是第一次导入成功。"
cover: /images/timeline/rag-content-lifecycle.svg
top_img: /images/timeline/rag-content-lifecycle.svg
permalink: /2024/02/09/rag-content-lifecycle/
comments: false
---

<!-- generated: timeline-backfill -->

Demo 只关心文档能否被搜到，平台必须处理新增、更新、撤回、权限变化和索引失败。

![RAG 从 Demo 到平台差的是生命周期](/images/timeline/rag-content-lifecycle.svg)

## 别急着换组件

摄取链路为每个文档建立状态机，解析成功不等于索引已生效。

## 实施顺序

- 源文档删除或权限收紧时优先撤回检索结果，再异步清理底层向量。
- 索引版本切换使用双写和抽样对比，避免重建期间答案质量突然波动。

RAG 真正进入生产，是内容变化能稳定传递到答案，而不是第一次导入成功。

### 延伸资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
