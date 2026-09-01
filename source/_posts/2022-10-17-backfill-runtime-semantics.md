---
title: "补数据为什么不能伪装成正常调度：业务时间、Run 与输出版本"
date: "2022-10-17 12:39:39"
updated: "2022-10-17 12:39:39"
categories:
- "数据开发"
tags:
- "补数据"
- "任务调度"
- "Apache Airflow"
description: "结合 Apache Airflow 2.4.1 的 data interval、logical date、DagRun 与 BackfillJob，拆解补数据任务的时间语义、运行身份、幂等发布和下游放行边界。"
cover: /images/articles/backfill-runtime-semantics.svg
top_img: /images/articles/backfill-runtime-semantics.svg
permalink: /2022/10/17/backfill-runtime-semantics/
comments: false
editorial_standard: expert-v1
---

补数据最危险的做法，是改一个业务日期参数，然后把它当普通调度实例再跑一遍。页面上只有一个绿色的“成功”，实际发生的事情可能是：旧分区被覆盖了一半、下游提前启动、失败重试又写出一份重复数据，最后谁也说不清当前结果来自哪版代码。

我更愿意把补数据看成一类独立运行，而不是正常调度的快捷入口。它至少要回答四个时间：处理哪段业务数据、何时提出请求、何时真正执行、哪一刻把结果发布给下游。再加一个独立的 `run_id`，这件事才有可追踪的起点。

![补数据运行的四个时间与一个发布闸门](/images/articles/backfill-runtime-semantics.svg)

<!-- more -->

## 业务时间和运行时间必须拆开

一条处理 10 月 1 日订单的日任务，可能在 10 月 17 日才补跑。`2022-10-01` 是数据区间，17 日是触发和实际运行时间。把二者都塞进一个 `execution_time` 字段，日志、SQL 模板、依赖判断和 SLA 就会各自猜它代表什么。

Airflow 2.4.1 的文档已经把这几个概念分开：DAG Run 有真实的 start/end date，也有描述目标数据区间的 logical date；对于周期任务，logical date 标记 data interval 的开始。它还特别举了三个月历史数据回填的例子：这些 Run 可以在同一天真正启动，但每个 Run 处理不同的一天。

平台层面我会明确保存：

```text
data_interval_start / data_interval_end  处理的数据边界
requested_at                             补数申请时间
triggered_at                             调度器生成运行的时间
started_at / finished_at                 执行器实际运行时间
```

SQL 取数只能使用 data interval，资源排队分析用 started_at，补数审批审计用 requested_at。时区也要进入定义：业务日按 Asia/Shanghai 切分，就不能让 UTC 日期字符串碰巧代替。跨夏令时地区更不能用固定 24 小时推导自然日。

## 同一个分区可以有多个 Run

业务日期不是运行主键。10 月 1 日这个分区可以先由正常调度生成一次，修复代码后补跑一次，质量不通过再重跑一次。它们处理相同 data interval，却有不同代码、参数、提交人和结果。

我会把身份拆成四层：`job_id + data_interval + run_id + attempt_no`。`run_id` 表示一次有业务意义的运行；`attempt_no` 只表示这个 Run 在执行层的技术重试。网络抖动导致容器重启，可以增加 attempt；换了 SQL 再计算，则应该产生新的 Run。否则审计记录会把两次不同计算折叠成“第三次重试”。

Airflow 2.4.1 的 `BackfillJob` 会为指定时间范围组织 DAG Runs，并把新建 Run 标成 `DagRunType.BACKFILL_JOB`。源码还显示，创建 Run 时同时写入 execution date、data interval、实际 start date 和 run type。这正说明回填不是简单篡改一次普通实例的日期。

运行身份要一路传到引擎、日志和输出：Spark application、Flink job、Kubernetes Pod、YARN application 都要能反查平台 `run_id`。只在调度数据库里记一次成功，执行端留下的匿名 application 无法支撑故障定位。

## 幂等不是一句“先删后写”

不少补数流程把幂等理解成：运行前删除目标分区，再执行 INSERT。这个策略在单任务、无并发、下游暂停时勉强可用，一旦任务失败或两个补数请求重叠，读方会看到空分区、半成品，甚至新旧结果互相覆盖。

更稳妥的做法是按 `run_id` 写隔离路径或新版本：

```text
warehouse/order_dt=2022-10-01/_runs/<run_id>/...
```

运行结束后检查行数、主键重复、业务汇总、文件完整性和 schema，再原子切换分区元数据或 current pointer。发布失败时，旧版本继续对外；新版本保留一段时间供诊断，之后由清理任务回收。

数据库或 Hive 分区如果缺少真正的事务切换能力，也要尽量缩短不可见窗口，并把“计算完成”和“发布完成”分成两个状态。执行 SQL 成功不等于消费者已经拿到完整版本。

幂等还包含副作用。发送通知、调用外部 API、写搜索索引的任务不能因补数自动重复执行。DAG 要标明哪些节点是纯计算、哪些会产生外部副作用；补数默认只重建数据，副作用节点需单独授权或用业务幂等键去重。

## 依赖应该等发布版本，而不是等一个绿色实例

正常调度通常按业务周期串联：上游 10 月 1 日成功，下游同日开始。补数发生时，如果平台复用这个成功标志，可能出现两个相反的问题：下游认为历史实例早已成功，不再消费新结果；或者补数一启动就把正常依赖重置，整条生产链被意外拉起。

我会让依赖面对“可消费版本”而不是运行状态。上游新 Run 完成计算后先停在 `VERIFYING`，质量检查通过并完成原子发布，才产生一个新的 dataset/version 事件。下游是否跟随这个事件，由补数请求明确选择：

- 只修上游数据，不触发下游；
- 沿血缘展开受影响范围，经确认后逐层补跑；
- 发布新版本，但由下游 owner 在窗口内接管。

补数范围也要先冻结。用户填 10 月 1 日到 10 月 31 日，调度器应展开为明确的 31 个 data intervals，并记录所用 DAG/code version。执行过程中修改任务定义，不应让前十天和后十天悄悄使用不同版本；确需变更，就关闭旧请求并建立新请求。

## 并发控制要针对历史洪峰

三个月日任务回填不是 90 个普通实例。它们会在短时间内争抢同一队列、数据库连接、对象存储带宽和下游写锁。正常每天一个实例时看不出的倾斜，会在批量补数中放大。

Airflow 的 `BackfillJob` 会跟踪 active runs，并在创建 DAG Run 时检查 DAG 的 `max_active_runs`。这个机制能限制运行数量，但平台仍需考虑全链路资源：一个 Run 内可能并发几十个 Task，不同 DAG 也会打到同一个源库。

我的做法是同时设三层闸门：补数请求的最大 active intervals、任务/租户的执行并发、数据源或目标端的连接与吞吐配额。队列要能区分生产周期任务和历史回填，默认保证当日 SLA，再用剩余容量推进补数。

是否顺序执行不能只看性能。带 `depends_on_past`、累计快照或前一日状态的任务，必须按 data interval 串行；每天独立分区的无状态计算才适合并行。平台可以提供倒序、正序和并行策略，但选择依据要写进任务定义，而不是靠操作员临场猜。

## 补数完成必须能对账

“31 个实例都成功”不是完成标准。我会先对请求级清单做对账：计划 31 个区间，实际创建多少 Run；每个 Run 最终发布了哪个版本；是否存在跳过、取消、重复发布或仍在重试的区间。

然后对数据做对账。历史数据的上游可能已变化，补跑结果和当初产出不相同并不必然是错，但差异必须能解释。平台至少保存输入版本/快照、代码提交、参数摘要、输出统计和质量结果。没有可重现输入时，要明确标注“按当前上游重算”，不能暗示恢复了历史现场。

最后是下游闭环。若选择级联补跑，血缘范围、执行顺序、失败节点和最终发布版本都应归入同一个 request ID。回滚不是把状态点成失败，而是把消费指针切回上一个已验证版本，并记录哪些下游已经读取过错误数据。

补数据做得可靠，靠的不是多一个日期选择框。它需要独立的运行身份、清晰的时间语义、隔离输出、发布闸门和请求级对账。把这些边界建起来后，补数才是可控制的工程操作，而不是在生产历史上直接改写结果。

## 对照源码与文档

- [Apache Airflow 2.4.1：DAG Run、data interval 与 logical date 的定义](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/docs/apache-airflow/concepts/dags.rst#L166-L198)
- [Apache Airflow 2.4.1 `BackfillJob`：回填一段时间范围内的 Task Instances](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/jobs/backfill_job.py#L56-L63)
- [Apache Airflow 2.4.1：创建 Backfill DagRun 时写入 data interval、start date 与 run type](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/jobs/backfill_job.py#L300-L337)
- [Apache Airflow 2.4.1：Backfill 运行数受 `max_active_runs` 检查](https://github.com/apache/airflow/blob/7b979def75923ba28dd64e31e613043d29f34fce/airflow/jobs/backfill_job.py#L311-L316)
