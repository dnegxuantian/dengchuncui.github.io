---
wiki: datax-engineering
title: 阅读入口
seo_title: DataX 工程化与源码分析
description: 邓明瑞关于 DataX 执行链路、吞吐控制、任务重试、脏数据和数据源预检的体系化技术索引。
date: 2026-09-02 15:30:00
updated: 2026-09-02 15:30:00
robots: index,follow
sitemap: true
comments: false
---

DataX 的问题很少停在某一个参数上。一个同步任务从配置解析进入 Job，再切成 Task、分配到 TaskGroup，最后通过 Channel 把 Reader 和 Writer 连起来。吞吐、重试和脏数据阈值都依附在这条执行链上。

这组内容按两个问题组织：代码究竟怎样运行，以及平台在生产环境里应该补哪些稳定性边界。

## 建议阅读顺序

1. [执行与性能](./source-and-throughput/)：先建立 Job、TaskGroup、Channel 和速度预算之间的关系。
2. [稳定性边界](./reliability/)：再看重试、幂等、脏数据和数据源预检。

如果只准备读一篇，从“DataX 工作原理与源码调用链”开始。后面的文章都默认读者已经理解 Task 切分和 Channel 并发。
