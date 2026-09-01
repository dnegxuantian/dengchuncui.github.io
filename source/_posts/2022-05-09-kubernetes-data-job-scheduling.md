---
title: "Kubernetes 跑数据任务要处理调度语义差异"
date: "2022-05-09 11:12:26"
updated: "2022-05-09 11:12:26"
categories:
- "资源治理"
tags:
- "Kubernetes"
- "数据任务"
- "调度"
description: "把数据任务从 YARN 搬到 Kubernetes，不是改一个提交地址。两套系统对队列、优先级和失败重建的语义不同。 迁移的验收点应是调度行为和故障恢复一致，而不是容器最终能启动。"
cover: /images/timeline/kubernetes-data-job-scheduling.svg
top_img: /images/timeline/kubernetes-data-job-scheduling.svg
permalink: /2022/05/09/kubernetes-data-job-scheduling/
comments: false
---

<!-- generated: timeline-backfill -->

把数据任务从 YARN 搬到 Kubernetes，不是改一个提交地址。两套系统对队列、优先级和失败重建的语义不同。

![Kubernetes 跑数据任务要处理调度语义差异](/images/timeline/kubernetes-data-job-scheduling.svg)

## 先看边界

1. Pod 已创建不代表计算资源已满足，调度事件与容器启动状态必须进入任务实例时间线。
2. Requests 决定可调度性，Limits 决定运行上限；只设置 Limits 会让容量预测失真。
3. Driver 与 Executor 的失败策略应分开，平台重试不能和 Kubernetes 重建互相叠加。

## 落地时我会盯住什么

迁移的验收点应是调度行为和故障恢复一致，而不是容器最终能启动。

### 延伸资料

- [Kubernetes Scheduling](https://kubernetes.io/docs/concepts/scheduling-eviction/)
