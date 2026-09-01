---
title: "调度实例状态机不能只靠成功失败"
date: "2022-11-03 10:32:54"
updated: "2022-11-03 10:32:54"
categories:
- "数据平台"
tags:
- "状态机"
- "任务实例"
- "调度器"
description: "只有 Running、Success、Failed 三个状态，无法描述排队、提交、取消和引擎失联，运维动作也容易互相冲突。 状态机写得清楚，故障恢复才有确定行为；否则每个按钮都是一次赌博。"
cover: /images/timeline/scheduler-instance-state-machine.svg
top_img: /images/timeline/scheduler-instance-state-machine.svg
permalink: /2022/11/03/scheduler-instance-state-machine/
comments: false
---

<!-- generated: timeline-backfill -->

只有 Running、Success、Failed 三个状态，无法描述排队、提交、取消和引擎失联，运维动作也容易互相冲突。

![调度实例状态机不能只靠成功失败](/images/timeline/scheduler-instance-state-machine.svg)

## 把问题拆开

平台状态与引擎状态分开保存，通过事件映射而不是直接覆盖。

停止、重跑、置成功都是状态迁移命令，必须校验前置状态并保证幂等。

## 验收标准

引擎回调乱序时以事件序号或版本号拒绝旧状态，避免成功实例被迟到的 Running 覆盖。

状态机写得清楚，故障恢复才有确定行为；否则每个按钮都是一次赌博。

### 延伸资料

- [Apache Hadoop Documentation](https://hadoop.apache.org/docs/stable/)
