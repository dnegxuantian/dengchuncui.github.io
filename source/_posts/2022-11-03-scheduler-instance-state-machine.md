---
title: "调度实例状态机怎么设计：Queued、Running 与 Lost 不能靠一个字段猜"
date: "2022-11-03 10:32:54"
updated: "2022-11-03 10:32:54"
categories:
- "数据开发"
tags:
- "任务调度"
- "状态机"
- "Apache Airflow"
description: "从 Apache Airflow 2.4.1 的 TaskInstance 与 DagRun 状态出发，说明数据调度平台如何定义状态所有权、失联对账、重试身份和工作流终态。"
cover: /images/articles/scheduler-instance-state-machine.svg
top_img: /images/articles/scheduler-instance-state-machine.svg
permalink: /2022/11/03/scheduler-instance-state-machine/
comments: false
editorial_standard: expert-v1
---

调度页面上最容易被低估的是“状态”这一列。很多系统只存等待、运行、成功、失败四个值，再由调度器、执行器、回调接口和人工操作一起修改。刚上线时看不出问题；一旦消息延迟、worker 重启或用户点了重跑，同一个实例会在几秒内来回变色，最后状态与实际进程各说各话。

我设计实例状态机时，先问三个问题：谁有权写这个状态，凭什么证据迁移，迟到事件还能不能改变结论。状态不是 UI 文案，而是控制依赖、重试、资源回收和告警的业务协议。

![调度实例状态不是一条直线](/images/articles/scheduler-instance-state-machine.svg)

<!-- more -->

## 先拆开调度状态和执行状态

`SCHEDULED`、`QUEUED`、`RUNNING` 看起来只是三个连续阶段，背后却属于不同系统。调度器确认依赖满足，把实例标成可提交；executor 接受任务，表示它已进入某个队列；worker 真正启动进程后，才进入运行。

如果平台在调用 executor API 成功后直接写 RUNNING，排队时间会被吞掉。任务等待二十分钟才拿到容器，报表却显示它“运行”了二十一分钟，开发者会去优化 SQL，而真正瓶颈是资源队列。反过来，只凭 worker 回调更新状态，提交后丢消息的实例又可能永远停在 SCHEDULED。

我会给每次迁移记录 `from_state`、`to_state`、`event_id`、`actor`、`event_time`、`observed_at` 和证据引用。当前状态是事件归并后的快照，状态历史才是诊断依据。`event_time` 表示事情发生的时间，`observed_at` 表示平台收到它的时间；二者不能混成一个更新时间。

Airflow 2.4.1 的 `TaskInstanceState` 也区分 SCHEDULED、QUEUED、RUNNING、UP_FOR_RETRY、UP_FOR_RESCHEDULE、DEFERRED 等状态，并在注释中标明部分状态由 scheduler 设置、部分由 task instance 自身设置。细分状态的用途，是在模型里保留控制权边界，远不止多画几个颜色。

## Lost 应该表达未知，而不是失败

worker 心跳消失，只能证明平台暂时联系不上它，不能证明进程已经失败。容器可能仍在运行，完成事件也可能堵在消息队列里。调度器立即标失败并重试，就可能让两个 attempt 同时写同一分区。

我通常增加内部状态 `LOST` 或 `UNKNOWN`，并进入对账流程：

```text
1. 查询 executor 队列是否仍持有任务；
2. 查询 Kubernetes Pod / YARN application 的 UID 与终态；
3. 检查 worker lease 和最后心跳；
4. 检查输出提交标记与完成事件；
5. 超过证据等待窗口后再决定重试或失败。
```

对账结果可能是三种：执行端确认成功，接受晚到的 SUCCESS；进程已失败，进入 retry/failed；执行端从未接单，可以重新提交。只有“看不见心跳”这一个证据时，不应该选择其中任何一个结论。

迟到事件还需要 fencing。每个 attempt 带递增 token，worker 回调必须提交 `instance_id + attempt_no + event_id`。旧 attempt 在新 attempt 已开始后才上报成功，平台可以保存这个事实，却不能让它覆盖当前 attempt 的结果。否则状态会从 RUNNING 跳回旧 SUCCESS，输出版本也可能倒退。

## Retry 是新 attempt，不是把状态改回等待

失败后把同一行状态从 FAILED 改成 WAITING，会抹掉前一次执行的起止时间、日志位置、退出码和资源消耗。页面只剩最终成功，稳定性指标也会虚高。

正确关系是一个实例有多个 attempts。实例表示 `job + run/data interval` 的业务执行，attempt 表示一次进程级尝试。每个 attempt 单独保存 executor ID、worker、queued/start/end time、exit code 和 error category；实例状态由当前 attempt 与重试策略归并。

Airflow 的 `TaskInstance` 也把 `run_id`、`try_number` 纳入执行身份，源码中的 key 由 DAG、task、run、try number 和 map index 组成。开始执行时，它会增加 try number 并把状态改为 RUNNING；进入可重试失败时，又有独立的 UP_FOR_RETRY 状态。这些细节说明“第几次尝试”不能只写在日志文本里。

重试计时同样要显式。`retry_at` 是策略计算出的下一次允许时间，SCHEDULED 表示依赖和重试时间均已满足。系统重启后可以从数据库恢复定时，而不是依赖内存 timer。用户手工重跑若改变参数或代码，应建立新 Run；只重启相同运行的失败进程，才增加 attempt。

## 状态迁移必须带条件

状态机不是允许任意 `UPDATE instance SET state=?`。例如 QUEUED 到 RUNNING 必须来自当前 attempt 的 worker-start 事件；RUNNING 到 SUCCESS 必须带完成证据；FAILED 到 RUNNING 不应直接发生；人工置成功则是一个单独的 override 事件，需要操作者、理由和影响范围。

数据库更新要做 compare-and-set：

```sql
UPDATE task_attempt
SET state = 'RUNNING', started_at = :event_time, version = version + 1
WHERE id = :attempt_id
  AND state = 'QUEUED'
  AND version = :expected_version;
```

受影响行数为零，不代表直接重试写库，而是说明状态已被别的事件推进，需要重新读取并判断这个事件是重复、迟到还是冲突。事件 ID 做幂等，状态 version 防止并发覆盖，两层都要有。

取消也不是一个瞬时动作。用户发出 cancel request 后，平台先进入 CANCELLING，向 executor 发送终止请求，等执行端确认后才是 CANCELLED。超时则进入需要对账的 UNKNOWN/CANCEL_FAILED。直接显示“已停止”会让用户误以为资源和写入都已终止。

## DAG Run 的成功不等于所有 Task 都成功

工作流终态通常由叶子节点决定，而不是简单统计所有 Task。分支任务会产生 SKIPPED，某些失败可能被容错节点吸收，清理节点又可能把图的叶子变成 SUCCESS。平台若只算 `failed_count == 0`，会误判合法的分支；只看最后一个节点，也可能让错误被掩盖。

Airflow 2.4.1 的 `DagRun.update_state()` 会先区分 unfinished、finished 和 schedulable Task Instances，再检查 DAG leaves：叶子存在 failed/upstream_failed 时 Run 失败，叶子全部位于 success states 时 Run 成功；如果任务未完成却没有可运行项，还会按 deadlock 处理。这套规则值得参考，但业务平台还需要补一层“数据是否发布”的状态。

我倾向于分开 `execution_state` 与 `publication_state`。所有 Task 执行成功，只说明计算流程结束；质量检查、元数据提交或分区切换未完成时，结果仍不可消费。下游依赖只认 publication success，运维页面同时展示两者，避免一个绿色 DAG Run 掩盖发布失败。

## 指标要从迁移时间算，不从最终行算

有完整状态事件后，排队时长是 RUNNING.event_time - QUEUED.event_time，依赖等待是 SCHEDULED - CREATED，实际执行是 terminal - RUNNING。仅用当前记录的 create/update time，所有阶段都被压成一个模糊 duration。

告警也应按状态语义设置。QUEUED 过久查队列和配额；RUNNING 无心跳进入 Lost 对账；UP_FOR_RETRY 过久检查重试定时；SCHEDULED 未提交检查 scheduler/executor 接口。统一报“任务卡住”只会把不同责任人拉进同一个群。

上线新状态前，我会先做兼容映射：旧 API 客户端可能只认识 RUNNING/FAILED，数据仓库里的报表也可能写死枚举。内部状态可以更细，外部接口按版本聚合；同时保留 raw_state，避免向下兼容时把信息永久丢掉。

调度系统真正难的是让每次迁移有唯一身份、有证据、有所有者，面对重复和乱序事件仍得到同一个结果。状态图只是表达方式。做到这一点，页面的颜色才可信，自动重试和依赖放行才不会变成事故放大器。

## 对照源码与文档

- [Apache Airflow 2.4.1：TaskInstance 与 DagRun 状态枚举](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/utils/state.py#L25-L71)
- [Apache Airflow 2.4.1：TaskInstance 执行身份包含 run_id、try_number 与 map_index](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/models/taskinstance.py#L385-L402)
- [Apache Airflow 2.4.1：TaskInstance 进入执行时增加 try number 并写 RUNNING](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/models/taskinstance.py#L1330-L1376)
- [Apache Airflow 2.4.1：DagRun 根据叶子任务与 deadlock 计算终态](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/models/dagrun.py#L516-L640)
