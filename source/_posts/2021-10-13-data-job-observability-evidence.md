---
title: "数据任务可观测性要保留运行证据"
date: "2021-10-13 18:41:17"
updated: "2021-10-13 18:41:17"
categories:
- "平台稳定性"
tags:
- "可观测性"
- "任务实例"
- "故障诊断"
description: "任务失败后只剩一段截断日志，平台就很难给出可靠诊断。真正有用的可观测性要能还原那次运行。 可观测性的最低标准，是隔天仍能回答这次任务为什么以这个参数跑成了这个结果。"
cover: /images/timeline/data-job-observability-evidence.svg
top_img: /images/timeline/data-job-observability-evidence.svg
permalink: /2021/10/13/data-job-observability-evidence/
comments: false
---

<!-- generated: timeline-backfill -->

任务失败后只剩一段截断日志，平台就很难给出可靠诊断。真正有用的可观测性要能还原那次运行。

![数据任务可观测性要保留运行证据](/images/timeline/data-job-observability-evidence.svg)

## 架构判断

> 实例必须绑定代码版本、配置快照、输入分区、资源申请和执行引擎标识。

- 日志、指标和调度事件使用同一个实例 ID，才能把排队、启动、运行、失败串成时间线。
- 页面展示的最终状态不是证据，原始错误、退出码和引擎侧状态都要保留。

## 留给运维的答案

可观测性的最低标准，是隔天仍能回答这次任务为什么以这个参数跑成了这个结果。

### 延伸资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
