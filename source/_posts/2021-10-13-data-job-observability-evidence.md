---
title: "数据任务失败为什么总要翻五个系统：先把 instance_id 传到执行端"
date: "2021-10-13 09:24:56"
updated: "2021-10-13 09:24:56"
categories:
- "数据平台"
tags:
- "可观测性"
- "任务调度"
- "OpenTelemetry"
description: "从调度实例、YARN application attempt 到日志、指标和输入输出水位，说明数据平台怎样建立可关联、可复现的运行证据链。"
cover: /images/articles/data-job-observability-evidence.svg
top_img: /images/articles/data-job-observability-evidence.svg
permalink: /2021/10/13/data-job-observability-evidence/
comments: false
editorial_standard: expert-v1
---

数据任务失败后，排查过程经常是这样的：先在调度平台找到实例，再去 YARN 搜 application，进入引擎页面找 stage，最后 SSH 到某个节点翻 container 日志。中间任何一层 ID 没记住，就只能靠任务名和时间范围碰运气。

这不是日志数量不够，而是缺少关联键。调度器、提交服务、资源管理器和计算引擎各自都有状态，却没有一条稳定标识把它们连成同一次运行。平台最后只能截取“最近 100 行”放在失败弹窗里，看起来集中，实际上丢掉了大量上下文。

我做数据任务可观测性时，第一步不会先搭新的日志检索页面，而是把 `schedule_instance_id` 从创建实例开始传到执行端，并在每次外部资源分配后立即保存映射。只要关联关系可靠，日志、指标、trace 和配置才有机会组成证据链。

![数据任务从调度实例到运行证据的关联链](/images/articles/data-job-observability-evidence.svg)

<!-- more -->

## 任务名不是一次运行的身份

任务名会修改，也可能在不同项目中重复。计划时间也不够稳定：补数、手动运行和重试都可能拥有相同的业务日期，一次提交延迟几分钟后，靠时间窗口搜索很容易匹配到另一轮运行。

我会区分至少四类 ID：

| 标识 | 表达的对象 |
| --- | --- |
| `job_id` | 可编辑的任务定义 |
| `schedule_instance_id` | 某个调度周期产生的一次逻辑运行 |
| `attempt_id` | 同一实例的第几次执行尝试 |
| `engine_execution_id` | 外部引擎分配的 application、job 或 query ID |

实例重试时，`schedule_instance_id` 不变，平台 `attempt_id` 递增；每个 attempt 可能拿到新的 YARN ApplicationId 或 Flink JobId。这样用户说“这次实例失败两次、第三次成功”，数据库里能准确表示，而不是把旧状态覆盖掉。

YARN 自身也有类似层次。`ApplicationAttemptId` 属于一个 `ApplicationId`，一个 ApplicationMaster 因节点、网络等临时故障可能产生多个 attempt；`ContainerId` 又带着分配它的 ApplicationAttemptId。平台如果只保存 application ID，会把不同 AM attempt 的 container 日志混在一起。

关联键需要在提交请求里显式传播，例如作为 YARN application tag、Flink job name 的结构化后缀、环境变量和日志 MDC 字段。只在任务名称里拼一个 ID 能应急，但后续解析脆弱，最好同时保存独立属性。

## 外部执行 ID 必须在拿到时立即落库

提交服务调用引擎后，通常先拿到 application ID，真正的任务还在异步运行。如果进程在“提交成功”和“更新实例表”之间崩溃，集群上会留下一个无人认领的 application，调度平台却认为提交失败，再次重试后又启动一份。

这个窗口不能靠多写日志解决。提交协议要支持幂等 request ID，平台先为 attempt 分配稳定 ID，再提交；引擎返回 execution ID 后，在进入轮询前持久化映射。恢复进程先按 request/attempt 查已有执行，不要直接重新提交。

我倾向于把状态变化保存为事件，而不是只更新一列：

```text
09:20:01 attempt_created
09:20:03 submit_started        request_id=req-...
09:20:05 engine_accepted       application_id=application_...
09:20:08 state=ACCEPTED
09:21:14 state=RUNNING         app_attempt=1
09:37:42 state=FAILED          diagnostics=...
```

当前状态可以由事件归并得到，原始转移记录用于解释“为什么页面刚才显示运行中，现在显示提交失败”。轮询返回旧状态、回调乱序时，也能依据来源时间和状态机规则拒绝倒退。

状态事件至少同时保存平台接收时间与引擎事件时间。跨机器时钟可能有偏差，所以因果顺序优先使用 ID、sequence 和状态机，不要只靠时间戳排序。

## TraceId 用来关联，领域 ID 用来审计

OpenTelemetry 的 `SpanContext` 包含 TraceId 与 SpanId，子 span 继承同一个 TraceId。日志数据模型也预留 TraceId、SpanId、Resource、Attributes 等字段，方便从一条错误日志跳回对应 span。

这些机制很适合串起一次同步调用，例如调度器请求提交服务、提交服务访问元数据库、再调用引擎网关。数据任务却常常运行几小时，经过消息队列、重试和异步回调。把整个生命周期硬塞进一个长 span，采样、超时和存储成本都会变得难处理。

我的做法是让领域 ID 永久保存，trace 做阶段性诊断：

- `schedule_instance_id`、`attempt_id`、`engine_execution_id` 进入每条状态事件和关键日志，不受 trace 采样影响；
- 提交、轮询、停止、重跑等控制面调用各自形成 span，并把领域 ID 放进 attributes；
- 异步阶段不能表达成严格 parent-child 时，用 span link 关联原提交；
- 从日志中的 TraceId 可以进入调用链，从 trace attributes 也能回到完整任务实例。

OpenTelemetry Resource 表示产生遥测数据的实体，可以包含 Kubernetes Pod、namespace、deployment 等属性。对于数据任务，我还会附上执行集群、队列、worker 类型、引擎版本。这些属性描述“日志从哪里来”，不要拿它们代替实例 ID；同一个 Pod 可以连续执行很多实例。

Trace 也不应该细到每条数据记录。一个 DataX channel、Flink operator 或 Spark stage 可以作为阶段性观测单元，百万行数据逐行建 span 只会把可观测系统本身压垮。数据层异常用计数器、采样错误和明确的 source position 更合适。

## 日志、指标、配置要指向同一个 attempt

一条 `OutOfMemoryError` 只有错误文本，诊断价值有限。需要知道它属于哪个 attempt、哪个 container、当时申请多少资源、处理到什么输入位置、代码和配置是哪一版。

我会给关键日志统一增加这些字段：

```json
{
  "instance_id": "...",
  "attempt_id": 3,
  "engine_execution_id": "application_...",
  "container_id": "container_...",
  "stage": "writer",
  "config_version": "sha256:...",
  "code_version": "git:...",
  "trace_id": "..."
}
```

同一组低基数字段可以作为指标标签：job type、engine、queue、cluster、result、error category。实例 ID、SQL 文本、完整异常这类高基数内容不要直接做时序指标 label，否则基数会迅速膨胀；它们保存在事件或日志里，通过查询链接下钻。

配置快照要在 attempt 创建时冻结。任务定义在运行过程中被修改，失败实例仍应指向当时的 SQL、JAR、参数、数据源版本和资源配置。密码与 token 不保存明文，只记录 secret reference 与版本。没有配置快照，所谓“用相同参数重跑”往往已经不是同一实验。

指标曲线也要能回到运行实例。CPU、内存、GC、吞吐、反压、读写失败数应带 engine execution 或 container 的映射；平台查询时先由 instance 找资源 ID，再按时间范围取指标。把所有 worker 的平均 CPU 放在任务详情页，只会掩盖单个热点 container。

## 输入水位与输出提交才是数据证据

任务显示 SUCCESS，只证明执行框架返回成功，不证明业务数据完整。一次可验证的运行还需要记录输入和输出边界。

批任务可以保存源分区、文件清单版本、表 snapshot ID；流任务保存 Kafka offsets、Binlog position、checkpoint ID；目标是 Hive 分区时保存目标路径和提交标记，是 Iceberg 时保存 committed snapshot ID。这样才能回答“这一轮到底处理了哪批数据，结果提交到哪里”。

行数和脏数据数属于摘要证据，不能替代边界。两次任务都写了 100 万行，可能处理的是不同 offset；重跑写入相同分区，看起来成功，实际覆盖了后来补进的数据。输入水位、配置版本和输出版本放在一起，才具备复现条件。

我会把一次运行的证据归成五组：

1. 身份：instance、attempt、engine application/container；
2. 输入：分区、offset、snapshot 或 query cutoff；
3. 执行：代码、配置、SQL、资源和状态事件；
4. 观测：日志、trace、指标与错误样本；
5. 输出：目标版本、提交 ID、计数与校验结果。

平台详情页的作用，是用同一个 attempt 把五组信息组织起来，不是把五套系统都嵌一个 iframe。

## 保留原始证据，摘要可以重新生成

“最后 100 行日志”适合快速预览，不适合做唯一留存。真正错误可能在几分钟前第一次出现，后面的级联异常会把它挤掉；多 container 任务的最后 100 行也不知道来自哪个进程。

原始日志应按 attempt/container 保存到可检索存储，UI 展示错误附近上下文并提供原文件定位。错误摘要、根因分类可以后算，原始文本一旦截断就无法恢复。日志保留期至少覆盖常见故障复盘与版本发布周期，删除策略要能解释。

可观测性做完的标志，不是页面多了三张曲线，而是拿到任意一个失败实例 ID，可以沿确定关系找到它提交的真实 application、所有 attempt 与 container、当时的配置和代码、输入输出水位，再用同样条件做一次受控重现。能走完这条链路，排障才从“经验搜索”变成证据判断。

## 对照规范与源码

- [OpenTelemetry 1.6 Logs Data Model：Timestamp、TraceId、SpanId、Resource 与 Attributes](https://github.com/open-telemetry/opentelemetry-specification/blob/d139f05db0f25acdb34c8e30efbc4674498f2c6c/specification/logs/data-model.md#L171-L212)
- [OpenTelemetry 1.6 Resource：用不可变属性描述遥测来源实体](https://github.com/open-telemetry/opentelemetry-specification/blob/d139f05db0f25acdb34c8e30efbc4674498f2c6c/specification/resource/sdk.md#L1-L29)
- [OpenTelemetry 1.6 Trace API：SpanContext 中的 TraceId 与 SpanId](https://github.com/open-telemetry/opentelemetry-specification/blob/d139f05db0f25acdb34c8e30efbc4674498f2c6c/specification/trace/api.md#L183-L220)
- [OpenTelemetry 1.6 Trace API：span link 可连接其他 trace 中的工作](https://github.com/open-telemetry/opentelemetry-specification/blob/d139f05db0f25acdb34c8e30efbc4674498f2c6c/specification/trace/api.md#L398-L420)
- [Hadoop 3.3.0 `ApplicationAttemptId`：同一应用可因临时故障产生多次 attempt](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-api/src/main/java/org/apache/hadoop/yarn/api/records/ApplicationAttemptId.java#L30-L38)
- [Hadoop 3.3.0 `ContainerId`：Container 关联 ApplicationAttemptId](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-api/src/main/java/org/apache/hadoop/yarn/api/records/ContainerId.java#L39-L80)
