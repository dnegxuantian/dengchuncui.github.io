---
title: "DataX 任务重试为什么会放大故障：TaskGroupContainer 的重试边界"
date: "2020-12-19 17:35:09"
updated: "2020-12-19 17:35:09"
categories:
- "数据同步"
tags:
- "DataX"
- "任务重试"
- "幂等性"
description: "结合 2020 年 DataX 源码分析 TaskGroupContainer 的失败重试条件、Writer 幂等要求、固定退避和旧线程退出边界。"
cover: /images/articles/datax-task-retry-state.svg
top_img: /images/articles/datax-task-retry-state.svg
permalink: /2020/12/19/datax-task-retry-boundary/
comments: false
editorial_standard: expert-v1
---

同步任务偶发失败时，加几次自动重试很诱人。网络抖一下能自己恢复，值班的人也少接一条告警。问题是，重试会把整个 Task 再执行一遍。Writer 如果不具备幂等能力，一次短暂故障很可能被放大成重复数据。

DataX 对这件事并非完全没有防护。它没有根据异常类型判断“可恢复”或“不可恢复”，而是把决定权交给 Writer：只有 Writer 明确声明支持 FailOver，`TaskGroupContainer` 才会重建 Task。

这篇笔记核对的是 2020 年 12 月 17 日的 DataX 提交 `5485fb3`，距离文章日期两天。先把源码行为说清楚，再讨论调度平台应该补哪一层。

![DataX Task 失败后的重试状态](/images/articles/datax-task-retry-state.svg)

<!-- more -->

## `maxRetryTimes` 表示总尝试次数

`TaskGroupContainer.start()` 启动时读取三个 FailOver 参数：

```java
int taskMaxRetryTimes = configuration.getInt(
        "core.container.task.failOver.maxRetryTimes", 1);

long taskRetryIntervalInMsec = configuration.getLong(
        "core.container.task.failOver.retryIntervalInMsec", 10000);

long taskMaxWaitInMsec = configuration.getLong(
        "core.container.task.failOver.maxWaitInMsec", 60000);
```

这几个值在当时的 `core.json` 里没有显式配置，代码默认值分别是 1、10 秒和 60 秒。

`maxRetryTimes` 这个名字容易让人误会。Task 第一次启动时 `attemptCount` 已经是 1，失败后的判断条件是：

```java
taskExecutor.supportFailOver()
        && taskExecutor.getAttemptCount() < taskMaxRetryTimes
```

默认值为 1 时，条件 `1 < 1` 不成立，一次都不会重试。配置为 3，最多会出现第 1、2、3 次尝试，也就是初次执行加两次重试。我在平台侧暴露这个参数时，会把页面文案写成“最大尝试次数”，否则使用者很容易多算一次。

## DataX 不判断异常是否值得重试

Task 执行失败后，源码没有检查 SQLState、网络异常类型或插件错误码。是否进入重试只有两个条件：尝试次数未到上限，Writer 支持 FailOver。

调用关系是这样的：

```text
TaskGroupContainer.TaskExecutor.supportFailOver()
  -> WriterRunner.supportFailOver()
    -> Writer.Task.supportFailOver()
```

`Writer.Task` 的默认实现直接返回 `false`。插件不主动覆盖，就不会重试。

```java
public abstract static class Task extends AbstractTaskPlugin {
    public abstract void startWrite(RecordReceiver lineReceiver);
    public boolean supportFailOver() { return false; }
}
```

这套设计关注的是写入能否安全再做一次，不是故障能否自行恢复。两者有联系，但不是一回事。

比如权限配置错误属于永久故障，等十秒再试不会变好；可如果 Writer 声明支持 FailOver，DataX 仍然会按次数重复尝试。反过来，一次临时网络断开可能很快恢复，但 Writer 无法保证重复写的结果，DataX 就应该失败退出。

我认同这个取舍。同步框架无法只看异常名称就判断前一次写入到底提交了多少。写入语义不确定时，宁可停止，也不要拿自动恢复赌数据正确性。

## MySQLWriter 为什么只允许 `replace`

2020 年这版 `MysqlWriter.Task` 覆盖了 `supportFailOver()`：

```java
@Override
public boolean supportFailOver() {
    String writeMode = writerSliceConfig.getString(Key.WRITE_MODE);
    return "replace".equalsIgnoreCase(writeMode);
}
```

只有 `writeMode=replace` 返回 `true`。普通 `insert` 再执行一次，已提交的部分可能产生重复记录或唯一键冲突；`replace` 在主键或唯一索引成立时，重复写同一行更接近幂等。

这里有两个边界不能省略。

第一，`replace` 依赖表上的主键或唯一索引。没有冲突键时，它的行为仍然接近普通插入，重试照样可能增加数据。

第二，MySQL 的 `REPLACE` 不是更新语句。发生唯一键冲突时，它会删除旧行再插入新行，触发器、自增列和关联逻辑都可能受到影响。任务能重试，只说明插件作者接受这种写入语义，不代表业务表一定适合。

所以我不会为了打开自动重试，把所有任务的 `writeMode` 机械改成 `replace`。应该先确认目标表的键，再核对失败重跑是否保持业务结果一致。

## 失败 Task 是怎样重新进入队列的

Task 状态变成 `FAILED` 后，`TaskGroupContainer` 先把旧 `TaskExecutor` 放入 `taskFailedExecutorMap`。符合重试条件时会执行三步操作：

```java
taskExecutor.shutdown();
containerCommunicator.resetCommunication(taskId);
taskQueue.add(taskConfig);
```

旧 Reader、Writer 收到 `shutdown()` 和线程中断，Task 的通信状态被重置，原配置重新放回待运行队列。下一轮扫描到这个 Task 时，`attemptCount` 加一。

新 Task 不会马上启动。距离失败时间不足 `retryIntervalInMsec` 时，它继续留在队列里。这个版本采用固定等待，不会随着失败次数指数退避。目标库持续不可用时，多个 Task 可能在相近时间再次发起连接，调大重试次数会延长压力，并不会让恢复更聪明。

还有一个比较稳妥的处理：如果旧 Executor 没有真正退出，DataX 不会立刻启动新的 Reader 和 Writer。它会再次调用 `shutdown()`；超过 `maxWaitInMsec` 仍未结束，整个 TaskGroup 以 `WAIT_TIME_EXCEED` 失败。

这个等待很有必要。旧 Writer 仍在写，新 Writer 又拿着同一个 Task 配置启动，比任务失败更难处理。

## Task 重试与 Job 重跑不是一回事

DataX 这里处理的是 TaskGroup 内单个 Task 的 FailOver。一次 Job 往往被切成多个 Task，已经成功的 Task 不会因为另一个 Task 重试而重新执行。

调度平台上的“失败自动重跑”通常会重新提交整个 DataX Job。两层重试叠在一起后，执行次数很容易失控：

```text
调度器最多重跑 3 次
× DataX 每个 Task 最多尝试 3 次
= 某个失败切片最多执行 9 次
```

实际情况还会更复杂。Job 第一次运行时已经成功的切片，在调度器重跑时也会再执行。目标表若采用追加写，重复范围不再只是失败 Task，而可能覆盖整个批次。

我处理这类任务时，会先确定哪一层拥有重试权。DataX Task FailOver 适合插件明确支持幂等的局部故障；调度器 Job 重跑则要依赖批次覆盖、临时表交换或业务主键去重。两层都开可以，但必须把最大执行次数和重复写边界算出来。

## 怎么判断一次失败该不该重试

我会依次确认四件事。

先看写入是否幂等。相同 Task 执行两遍，目标端的最终状态是否相同？这里要看真实 DDL、`writeMode` 和事务边界，不能只看插件名称。

再看错误是否可能自行消失。连接超时、服务端限流、节点切换可以进入候选；SQL 语法、字段类型、权限拒绝和磁盘配额耗尽，应该直接失败并保留现场。DataX 内核没有替我们做这项分类，平台层需要根据插件错误码和底层异常补上。

接着核对退避。固定 10 秒适合短暂闪断，不适合持续故障。上层调度如果还要重跑，至少使用递增间隔，并限制同一数据源的并发恢复数量。

最后检查观测字段。日志里应该能找到 `taskGroupId`、`taskId`、`attemptCount`、失败时间和旧 Executor 是否完成退出。没有这些信息，只看到 Job 最终成功，值班人员根本不知道它中间写了几遍。

重试不是提高成功率的免费开关。DataX 源码真正守住的是 Writer 能否重复执行这一条边界；异常分类、退避策略和整批重跑语义，仍然要由数据平台接住。

## 对照源码

- [`TaskGroupContainer.start()`：读取重试参数并处理失败 Task](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/taskgroup/TaskGroupContainer.java#L93-L241)
- [`TaskExecutor.supportFailOver()`：能力最终委托给 Writer](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/taskgroup/TaskGroupContainer.java#L536-L565)
- [`Writer.Task`：默认不支持 FailOver](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/common/src/main/java/com/alibaba/datax/common/spi/Writer.java#L34-L39)
- [`MysqlWriter.Task`：仅 `replace` 模式允许 FailOver](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/mysqlwriter/src/main/java/com/alibaba/datax/plugin/writer/mysqlwriter/MysqlWriter.java#L70-L98)
- [`CoreConstant`：FailOver 参数名称](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/util/container/CoreConstant.java#L28-L38)
