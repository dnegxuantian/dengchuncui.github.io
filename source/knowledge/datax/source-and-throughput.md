---
wiki: datax-engineering
title: 执行与性能
permalink: /knowledge/datax/source-and-throughput/
description: DataX 从 Engine 到 Reader/Writer 的调用链，以及 speed.byte、Channel 数量和运行时背压之间的关系。
date: 2026-09-02 15:31:00
updated: 2026-09-02 15:31:00
robots: index,follow
sitemap: true
comments: false
---

## 先把执行链串起来

- {% post_link 2020-10-22-28 "DataX 工作原理与源码调用链：Job、TaskGroup、Channel 到 Reader/Writer" %}

这篇是整个系列的入口。重点不是背类名，而是分清三种数量：Reader 切出的 Task 数、作业允许的 Channel 数，以及单个 TaskGroup 的并发上限。

## 再看吞吐为什么不只由一个参数决定

- {% post_link 2020-11-13-datax-throughput-control "DataX 的 speed.byte 为什么越调越怪" %}

速度预算会先参与 Channel 数量计算，运行期又会落到每个 Channel 的窗口限流。Reader、内存队列和 Writer 任意一端变慢，都会把表面上的“限速问题”变成背压问题。

## 排查性能时保留三类证据

- 提交前的完整任务 JSON；
- Task 切分数量、Channel 数量和 TaskGroup 分配日志；
- Reader、Channel、Writer 三段各自的吞吐和等待时间。

只有总速度，没有分段数据，很难判断继续加并发是在解决问题，还是在把压力推给目标端。
