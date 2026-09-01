---
title: "DataX 脏数据阈值的反直觉细节：record 和 percentage 不会同时生效"
date: "2021-01-07 11:02:01"
updated: "2021-01-07 11:02:01"
categories:
- "数据同步"
tags:
- "DataX"
- "脏数据"
- "数据质量"
description: "结合 DataX 2020 年底源码解释 errorLimit.record、percentage、脏数据计数和日志采样之间容易被混淆的真实关系。"
cover: /images/articles/datax-dirty-record-flow.svg
top_img: /images/articles/datax-dirty-record-flow.svg
permalink: /2021/01/07/datax-dirty-data-contract/
comments: false
editorial_standard: expert-v1
---

DataX 任务想容忍少量脏数据，通常会在 `job.setting.errorLimit` 里同时写条数和比例：小表不超过 10 条，大表不超过万分之一。这个意图很合理，但 2020 年底这版 DataX 并不会同时检查两条规则。

只要配置了 `record`，`ErrorRecordChecker` 就把 `percentageLimit` 设成 `null`。两个参数都写时，真正生效的只有条数。

另一个容易混淆的配置是 `core.statistics.collector.plugin.maxDirtyNumber`。它限制的是控制台最多打印多少条脏数据，不是任务能够容忍多少条。把这两个 `max` 当成同一个阈值，会得到一条“日志看起来不多，任务却突然失败”或“日志只打印几条，任务居然成功”的链路。

这篇笔记仍然使用 DataX 提交 `5485fb3`，提交时间是 2020 年 12 月 17 日。

![DataX 脏数据采集、日志输出与阈值检查](/images/articles/datax-dirty-record-flow.svg)

<!-- more -->

## 哪些记录会进入脏数据计数

Reader、Transformer 和 Writer 都可能把一条 Record 交给 `TaskPluginCollector.collectDirtyRecord()`。

典型情况包括字段转换失败、Writer 写入单条记录报错，以及单条 Record 的估算内存超过 Channel 的 `byteCapacity`。以 `BufferedRecordExchanger.sendToWriter()` 为例：

```java
if (record.getMemorySize() > this.byteCapacity) {
    this.pluginCollector.collectDirtyRecord(
            record,
            new Exception("单条记录超过大小限制"));
    return;
}
```

Collector 会按错误发生的位置增加不同计数：

```text
Reader / Transformer 侧 -> readFailedRecords
Writer 侧               -> writeFailedRecords
```

Job 的总错误记录数是两者相加：

```java
totalErrorRecords = readFailedRecords + writeFailedRecords;
```

这里统计的是被插件明确收集的脏 Record。插件直接抛出导致 Task 失败、JVM 退出或网络连接中断，不一定会转成一条脏数据。反过来也一样，任务最终状态是成功，并不表示每条输入都写到了目标端；只要错误数没有越过阈值，它可以带着脏数据成功结束。

所以我不会只看 Job 状态验收同步任务。成功状态要和读取条数、写入成功条数、脏数据条数一起看。

## `record` 的优先级不是文档约定，而是代码清空

任务模板给过这样的示例：

```json
{
  "job": {
    "setting": {
      "errorLimit": {
        "record": 0,
        "percentage": 0.02
      }
    }
  }
}
```

如果按配置表面理解，这是“脏数据不能超过 0 条，同时比例不能超过 2%”。第一条已经足够严格，第二条没有意义。`ErrorRecordChecker` 的构造器干脆把优先级写死了：

```java
if (recordLimit != null) {
    Validate.isTrue(recordLimit >= 0);
    percentageLimit = null;
}
```

这意味着下面两份配置效果相同：

```json
{"record": 10}
```

```json
{"record": 10, "percentage": 0.0001}
```

第二份不会在 10 条以内继续校验万分之一。想做“条数和比例任一超限就失败”，不能靠这一版 DataX 的原生配置，需要平台在任务结束后拿总量和错误数再做一次质量检查，或者修改 `ErrorRecordChecker` 的优先级逻辑。

这类配置我更倾向于在任务发布页直接阻止：选了条数阈值，就把比例输入置灰并解释原因。允许用户填两个值但静默忽略一个，故障时很难讲清楚。

## 两种阈值的检查时机也不同

条数阈值会在 Scheduler 运行循环里持续检查。`AbstractScheduler.schedule()` 每轮汇总 TaskGroup 的 Communication 后调用：

```java
errorLimit.checkRecordLimit(nowJobContainerCommunication);
```

当 `totalErrorRecords` 大于 `recordLimit`，Job 立即抛出 `PLUGIN_DIRTY_DATA_LIMIT_EXCEED`。判断是严格的大于号，所以 `record=10` 会允许前 10 条，第 11 条触发失败；`record=0` 则是第一条脏数据出现就失败。

检查并非每条 Record 都同步执行。Scheduler 还有自己的 sleep 周期，因此在发现越界前，Reader 和 Writer 可能已经继续处理了一批数据。目标端不是事务性整批提交时，任务失败也不等于目标表没有留下部分结果。

比例阈值只在 `scheduler.schedule()` 完成后，由 `JobContainer.checkLimit()` 做最终检查：

```java
errorLimit.checkRecordLimit(communication);
errorLimit.checkPercentageLimit(communication);
```

比例的分母是 `totalReadRecords`，即 `readSucceedRecords + readFailedRecords`；分子是 Reader 与 Writer 两侧失败记录之和。任务必须把数据跑完，才能得到最终比例。

这两种时机对应不同成本。条数阈值适合尽快止损，比例阈值适合数据规模差异很大的任务，但超限时整批读取和大部分写入可能已经发生。使用比例阈值的任务更需要可回滚的写入方式。

## `maxDirtyNumber` 只管打印，不管失败

默认 `core.json` 里还有一项：

```json
{
  "core": {
    "statistics": {
      "collector": {
        "plugin": {
          "maxDirtyNumber": 10
        }
      }
    }
  }
}
```

它被 `StdoutPluginCollector` 读取，用来控制脏记录日志输出。无论后面的脏数据还打印不打印，父类 `AbstractTaskPluginCollector.collectDirtyRecord()` 都会继续增加失败计数。

也就是说，控制台只看到少量样本，不代表后面没有继续丢记录。这个设计能防止一批坏数据把日志写爆，但运维平台如果只从文本日志统计脏数据，会严重少算。正确数字应该取 Communication Counter，日志样本用于定位字段和值。

我还会把脏数据样本单独落到隔离存储，至少包含：

```text
jobId / taskGroupId / taskId
源记录或脱敏后的字段值
Reader / Transformer / Writer 阶段
异常类型与消息
任务代码版本和配置版本
采集时间
```

DataX 默认 stdout 格式能打印 `type`、`message`、`exception` 和 Record 列值，但日志会轮转，也可能因为隐私要求不能保留完整字段。平台要把“错误计数”和“可排查样本”分成两条链路管理。

## 阈值应该跟下游语义绑定

同样是 10 条脏数据，影响可以完全不同。日志明细表缺 10 行也许可以补录，客户余额表少一行都不能放过。阈值不是 DataX 层面的统一默认值，应该由数据用途决定。

我会先给任务选择处理策略：

- 强一致任务使用 `record=0`，发现脏数据就失败，写入端要支持整批回滚或覆盖重跑；
- 允许隔离的明细任务可以设条数阈值，但必须落脏数据明细并生成处理工单；
- 超大批次若使用比例阈值，要额外设置平台级绝对上限，避免低比例掩盖很大的错误总量；
- 探查或一次性迁移任务可以继续运行，但结果必须标记“带脏数据完成”，不能和正常成功混成一个状态。

这里故意没有给一个通用比例。百分之一对一千行是 10 条，对十亿行就是一千万条。脱离数据规模和业务键谈默认容忍率，没有工程意义。

## 发布任务前我会做的验证

先用可控数据造三类错误：Reader 类型转换失败、Transformer 主动报错、Writer 违反目标表约束。确认三类错误分别进入哪个 Counter，日志里有没有可识别样本。

随后验证边界值。`record=10` 时跑出 10 条和 11 条错误，确认前者成功、后者失败；只设置 `percentage` 时，用固定总量验证等于阈值和超过阈值的行为。

最后再测失败后的目标表。检查已经提交的批次是否保留，重跑是追加、覆盖还是幂等更新。阈值只负责决定 Job 状态，不负责清理已经写出的数据。

DataX 把脏数据采集、日志采样和失败判定拆成了三件事。理解这三条链路以后，`errorLimit` 才能成为数据质量契约；否则它只是一个看起来很严格、实际含义却没人说得清的 JSON 配置。

## 对照源码

- [`ErrorRecordChecker`：record 优先并清空 percentage](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/util/ErrorRecordChecker.java#L12-L81)
- [`AbstractScheduler.schedule()`：运行中检查条数阈值](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/job/scheduler/AbstractScheduler.java#L59-L103)
- [`JobContainer.checkLimit()`：任务结束后检查最终阈值](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/job/JobContainer.java#L957-L966)
- [`AbstractTaskPluginCollector`：Reader 与 Writer 脏数据计数](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/statistics/plugin/task/AbstractTaskPluginCollector.java#L47-L76)
- [`StdoutPluginCollector`：脏数据日志采样上限](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/statistics/plugin/task/StdoutPluginCollector.java#L35-L73)
- [`CommunicationTool`：总读取数与总错误数计算](https://github.com/alibaba/DataX/blob/5485fb328eb03fab5c2164a79e902d344475e27f/core/src/main/java/com/alibaba/datax/core/statistics/communication/CommunicationTool.java#L83-L105)
