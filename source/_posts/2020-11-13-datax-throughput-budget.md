---
title: "DataX 限速不是填一个 byte 参数"
date: "2020-11-13 11:42:59"
updated: "2020-11-13 11:42:59"
categories:
- "数据集成"
tags:
- "DataX"
- "数据同步"
- "性能治理"
description: "同步任务把源库拖慢时，第一反应往往是给 DataX 限速。参数能止血，但真正需要管理的是一条链路的吞吐预算。 我更愿意把限速配置当作容量协议，而不是一次故障后的临时旋钮。"
cover: /images/timeline/datax-throughput-budget.svg
top_img: /images/timeline/datax-throughput-budget.svg
permalink: /2020/11/13/datax-throughput-budget/
comments: false
---

<!-- generated: timeline-backfill -->

同步任务把源库拖慢时，第一反应往往是给 DataX 限速。参数能止血，但真正需要管理的是一条链路的吞吐预算。

![DataX 限速不是填一个 byte 参数](/images/timeline/datax-throughput-budget.svg)

## 把问题拆开

`channel` 决定并发通道数，字节速率和记录速率只是上限；Writer 端阻塞时，再高的 Reader 并发也只会堆积内存。

### 实施时

- 限速值要从源库可承受 QPS、网络带宽、目标端写入能力三边取最小值，并给在线业务留下余量。
- 压测时同时看读端延迟、Channel 等待和写端批次耗时，只看任务总速度很容易把瓶颈认错。

## 验收标准

我更愿意把限速配置当作容量协议，而不是一次故障后的临时旋钮。

### 延伸资料

- [Alibaba DataX](https://github.com/alibaba/DataX)
