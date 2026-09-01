---
title: "跨引擎指标先统一含义再统一名字"
date: "2022-12-26 16:59:20"
updated: "2022-12-26 16:59:20"
categories:
- "平台稳定性"
tags:
- "指标体系"
- "Spark"
- "Flink"
description: "把 Spark、Flink、DataX 的指标都接进一个大盘，并不等于可观测性统一。相同名称背后的统计窗口和对象常常不同。 统一指标的重点是可比较，不是把所有曲线改成同一个前缀。"
cover: /images/timeline/cross-engine-metric-semantics.svg
top_img: /images/timeline/cross-engine-metric-semantics.svg
permalink: /2022/12/26/cross-engine-metric-semantics/
comments: false
---

<!-- generated: timeline-backfill -->

把 Spark、Flink、DataX 的指标都接进一个大盘，并不等于可观测性统一。相同名称背后的统计窗口和对象常常不同。

![跨引擎指标先统一含义再统一名字](/images/timeline/cross-engine-metric-semantics.svg)

## 把问题拆开

先定义任务、Stage、算子、通道等对象层级，指标必须声明自己属于哪一层。

### 实施时

- 吞吐量注明输入还是输出、瞬时还是累计；延迟注明事件时间还是处理时间。
- 原始指标保留引擎命名，平台层用派生指标做映射，避免升级后语义悄悄变化。

## 验收标准

统一指标的重点是可比较，不是把所有曲线改成同一个前缀。

### 延伸资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
