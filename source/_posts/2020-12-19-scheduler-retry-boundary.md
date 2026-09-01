---
title: "调度重试要区分可恢复与不可恢复失败"
date: "2020-12-19 17:35:09"
updated: "2020-12-19 17:35:09"
categories:
- "数据平台"
tags:
- "任务调度"
- "重试"
- "稳定性"
description: "把所有失败都自动重试，看起来提高了成功率，实际上会把权限、语法和脏数据问题放大成资源风暴。 重试的目标不是把红色变绿色，而是用最小代价恢复可恢复的工作。"
cover: /images/timeline/scheduler-retry-boundary.svg
top_img: /images/timeline/scheduler-retry-boundary.svg
permalink: /2020/12/19/scheduler-retry-boundary/
comments: false
---

<!-- generated: timeline-backfill -->

把所有失败都自动重试，看起来提高了成功率，实际上会把权限、语法和脏数据问题放大成资源风暴。

![调度重试要区分可恢复与不可恢复失败](/images/timeline/scheduler-retry-boundary.svg)

## 别急着换组件

> 网络闪断、临时限流、计算节点退出属于可恢复故障；SQL 解析失败、字段缺失、权限拒绝通常不会因等待而消失。

- 重试策略至少要包含错误分类、退避间隔和最大占用时长，不能只有一个次数参数。
- 同一任务连续失败时应冻结后续实例，保留首个根因日志，而不是让新实例覆盖现场。

## 实施顺序

重试的目标不是把红色变绿色，而是用最小代价恢复可恢复的工作。

### 延伸资料

- [Apache Hadoop Documentation](https://hadoop.apache.org/docs/stable/)
