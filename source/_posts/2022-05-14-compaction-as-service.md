---
title: "Compaction 是持续服务，不是夜间脚本"
date: "2022-05-14 18:05:24"
updated: "2022-05-14 18:05:24"
categories:
- "湖仓架构"
tags:
- "Compaction"
- "小文件"
- "湖仓运维"
description: "文件合并一旦依赖固定夜间窗口，就会在数据量上涨或补数时失效。Compaction 更像一个持续受控的后台服务。 好的 Compaction 不追求零小文件，而是把读放大稳定在可接受范围内。"
cover: /images/timeline/compaction-as-service.svg
top_img: /images/timeline/compaction-as-service.svg
permalink: /2022/05/14/compaction-as-service/
comments: false
---

<!-- generated: timeline-backfill -->

文件合并一旦依赖固定夜间窗口，就会在数据量上涨或补数时失效。Compaction 更像一个持续受控的后台服务。

![Compaction 是持续服务，不是夜间脚本](/images/timeline/compaction-as-service.svg)

## 问题通常出在哪

触发条件应同时考虑文件数量、平均大小、查询放大和分区热度。

## 判断是否有效

- 合并要绑定输入快照并在提交时做冲突检测，避免覆盖并发写入。
- 服务需要资源预算和积压指标，否则它会与主链路争抢资源，越治理越拥堵。

好的 Compaction 不追求零小文件，而是把读放大稳定在可接受范围内。

### 延伸资料

- [Apache Iceberg Releases](https://iceberg.apache.org/releases/)
