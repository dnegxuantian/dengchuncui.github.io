---
title: "知识摄取失败不能静默跳过"
date: "2024-05-07 22:43:07"
updated: "2024-05-07 22:43:07"
categories:
- "AI 工程"
tags:
- "知识摄取"
- "索引"
- "数据质量"
description: "PDF 解析失败、表格丢列、编码异常如果只打印日志，知识库表面完成更新，实际已经缺页。 知识摄取和数据同步一样，需要批次、对账和错误隔离，不能当成一次文件上传。"
cover: /images/timeline/knowledge-ingestion-failure.svg
top_img: /images/timeline/knowledge-ingestion-failure.svg
permalink: /2024/05/07/knowledge-ingestion-failure/
comments: false
---

<!-- generated: timeline-backfill -->

PDF 解析失败、表格丢列、编码异常如果只打印日志，知识库表面完成更新，实际已经缺页。

![知识摄取失败不能静默跳过](/images/timeline/knowledge-ingestion-failure.svg)

## 别急着换组件

文档级记录抓取、解析、切分、Embedding、入索引五段状态。

每段保存输入输出数量和内容指纹，便于判断是空文档还是处理中丢失。

## 实施顺序

失败文档进入可重试队列并从可用版本回退，不让半成品覆盖旧索引。

知识摄取和数据同步一样，需要批次、对账和错误隔离，不能当成一次文件上传。

### 延伸资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
