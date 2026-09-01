---
title: "Kubernetes 跑数据任务，不能把 Pod 状态直接当调度实例状态"
date: "2022-05-09 11:12:26"
updated: "2022-05-09 11:12:26"
categories:
- "资源治理"
tags:
- "Kubernetes"
- "数据调度"
- "批任务"
description: "基于 Kubernetes 1.24 的 Job、Pod 与 CronJob API，说明数据平台迁移到 Kubernetes 后在重试、完成语义、资源请求和状态映射上的差异。"
cover: /images/articles/kubernetes-data-job-scheduling.svg
top_img: /images/articles/kubernetes-data-job-scheduling.svg
permalink: /2022/05/09/kubernetes-data-job-scheduling/
comments: false
editorial_standard: expert-v1
---

把数据任务从 YARN 或固定机器迁到 Kubernetes，最容易做的一步是把命令装进镜像，创建一个 Job。最容易出问题的一步，是把原来调度系统的实例语义原样套在 Pod 上。

数据平台关心的是某个业务日期、某次补数、某次人工重跑有没有完成，并且输出是否能被下游使用。Kubernetes 关心的是控制器怎样让指定数量的 Pod 成功结束。两者有交集，但不是同一件事。`Pod Succeeded`、`Job Complete` 和“这批数据已经正确提交”之间，必须有一层明确映射。

![数据平台调度实例与 Kubernetes Job 的职责边界](/images/articles/kubernetes-data-job-scheduling.svg)

<!-- more -->

## 一个调度实例不要直接等于一个 Pod

Pod 是一次执行载体，不是稳定的业务实例。Node 故障、驱逐、容器失败或控制器判断 Pod 丢失时，同一个 Job 可能创建新的 Pod。使用 `restartPolicy: OnFailure` 时，容器还可能在同一个 Pod 内重启；使用 `Never` 时，失败通常表现为新 Pod attempt。

如果平台只保存 `pod_name`，第一次失败后新建 Pod，日志链路就断了。更稳妥的标识层级是：

```text
schedule_instance_id
  -> kubernetes_job_uid
      -> pod_uid / attempt
          -> container restart count
```

平台实例在最外层，承载业务日期、上游依赖和补数范围；Job UID 是本次向 Kubernetes 提交的控制对象；Pod UID 表示一次真实调度；同一 Pod 的 container restart 还要单独计数。名称可以复用，UID 才能区分删除重建后的对象。

我通常让 Job label 带 `instance_id`，同时在平台数据库保存 Job namespace、name、UID、resourceVersion 和提交时间。回收状态时用 UID 防止误认同名新 Job，采集日志时则把 instance、Job 与 Pod 三层 ID 一起写进上下文。

## `backoffLimit` 不是数据任务的业务重试策略

Kubernetes 1.24 的 `JobSpec.backoffLimit` 控制 Job 在被标记失败前允许的重试次数，controller 对失败 Pod 采用指数退避。它解决的是执行容器失败后的控制循环，不知道 SQL 是否幂等，也不知道输出目录是否已写了一半。

数据平台的“重跑”通常含有更丰富的语义：复用原业务日期还是生成新实例、是否清理输出、是否从 checkpoint 恢复、是否级联重跑下游、人工修改参数后能否继续。把这些全交给 `backoffLimit`，平台只会看到一个 Job 长时间 Active，里面已经执行了多次有副作用的尝试。

我会把基础设施级短重试与业务重跑分开。镜像拉取、Node 瞬时故障、进程启动异常可以由 Job 做少量重试；涉及写外部系统、提交分区或消费 offset 的任务，要么自己实现幂等/事务，要么失败后回到平台创建新的受控 attempt。

`activeDeadlineSeconds` 也不是简单的 Pod 超时。Job 级 deadline 会覆盖 backoffLimit，超时后终止仍在运行的 Pod，并把 Job 标记失败。数据任务若还有优雅停止、checkpoint 或外部提交过程，平台要预留 termination grace period，并记录究竟是业务超时、Job deadline，还是平台主动取消。

## Job Complete 仍然不能证明输出只产生一次

Kubernetes Job 追求指定数量的成功 completion。分布式环境里，控制器与 kubelet 对状态的观察存在窗口；应用不能假设“每个逻辑工作单元一定只启动一次”。Kubernetes API 对 Indexed Job 提供 completion index，用来让并行任务识别各自编号，但这也不自动提供外部存储的 exactly-once。

一个导数任务可能已经把文件上传完成，进程却在上报成功前断开；下一次 attempt 会再次写同一批数据。反过来，容器 exit code 为 0，但最终表分区提交失败，Job 仍可能 Complete。

因此成功条件应该由任务协议定义。我会让执行端返回结构化结果，其中至少有 output version、row/file count、commit ID 和校验状态。平台收到 Job Complete 后还要读取这份结果，确认输出已原子发布，再把调度实例改成 SUCCESS。

对于 HDFS 分区，可以先写 attempt 临时目录，再由单一 committer 发布；对象存储上不要依赖 rename 假装原子；Iceberg 这类表格式则记录 committed snapshot ID。Kubernetes 只负责进程生命周期，数据提交边界仍属于执行引擎和存储协议。

## Scheduler 只看 requests，不懂任务峰值

Kubernetes scheduler 主要依据 Pod resource requests、Node 可分配资源和各种约束做放置。容器的 limit 影响运行期限制，但一个 memory limit 很大、request 很小的 Pod，仍可能被塞进看似有空间的 Node；多个任务同时到峰值时再一起 OOM。

数据任务的资源曲线通常不平：DataX 在并发 channel 拉起后增长，Spark/Flink driver 与 executor 职责不同，压缩和排序阶段有明显峰值。按平均 RSS 填 request 会提高表面利用率，却降低峰值重叠时的稳定性。

我会按角色拆模板。提交端、JobManager、TaskManager、单机同步任务分别定义 request/limit，不用一套固定比例。request 用可接受的常态峰值，limit 用异常保护边界；再结合队列并发控制，避免同一租户瞬间创建大量 Pod 把整个集群占满。

Pending 也要按调度原因分类。`Insufficient memory`、taint/toleration、node affinity、PVC binding、镜像拉取和 quota 是不同故障。平台若只显示“资源不足”，用户会反复调大内存，实际可能是 Pod 根本不允许落到任何 Node。

## CronJob 不能替代数据依赖调度

Kubernetes CronJob 能按时间创建 Job，并提供 `Allow`、`Forbid`、`Replace` 三种 concurrencyPolicy。它很适合独立的周期任务，却不理解数据日期、上游产出和补数区间。

`Forbid` 的含义是上一 Job 还在运行时跳过这次创建，不是把本次业务日期排队等待。`Replace` 会用新 Job 替换仍运行的旧 Job，也不等于安全地结束旧数据实例并接管状态。对有依赖的数据链路，直接使用 CronJob 会把“没创建”和“等待依赖”混在一起。

我倾向于保留数据调度器作为控制面，由它在依赖满足后创建普通 Job。CronJob 可以跑平台自身的巡检、清理和无依赖采集，但业务实例仍由调度状态机管理。这样补 30 天数据时，可以显式生成 30 个业务日期实例，按限流策略投递，而不是改一段 cron 等它慢慢触发。

## 状态回收必须处理观察空窗

平台监听 watch 事件很高效，但 watch 断开、resourceVersion 过期或服务重启都会产生观察空窗。只消费事件流而不做周期 reconciliation，某个 Job 已经完成，平台仍可能永远停在 RUNNING。

回收逻辑应该同时看 Job conditions、active/succeeded/failed 计数、关联 Pod 状态、container termination reason 和任务结果文件。状态优先级也要固定：平台主动停止后，即使 Pod 因 SIGTERM 报 Failed，也应保留 CANCELED 的业务语义；Job deadline 超时与应用 exit 1 不能都折成 FAILED。

删除资源要晚于证据收集。`ttlSecondsAfterFinished` 可以让 controller 自动清理已结束 Job 及其依赖对象，但如果 TTL 比日志和结果回收窗口还短，排障材料会先消失。我会先把终止状态、Pod UID、exit code、reason、日志位置和输出提交证据固化，再允许 TTL 回收。

Kubernetes 给数据平台带来弹性和统一资源管理，但它不会自动继承原调度器的业务语义。把实例、Job、Pod、attempt 与数据提交五个层次分开，迁移后的任务才不只是“容器能跑”，而是仍然可诊断、可重试、可验证。

## 对照源码与文档

- [Kubernetes 1.24 `JobSpec`：parallelism、completions、deadline 与 backoffLimit](https://github.com/kubernetes/kubernetes/blob/4ce5a8954017644c5420bae81d72b09b735c21f0/staging/src/k8s.io/api/batch/v1/types.go#L91-L121)
- [Kubernetes 1.24 `JobSpec`：TTL 与 Indexed/NonIndexed completion mode](https://github.com/kubernetes/kubernetes/blob/4ce5a8954017644c5420bae81d72b09b735c21f0/staging/src/k8s.io/api/batch/v1/types.go#L147-L184)
- [Kubernetes 1.24 `CronJobSpec`：schedule 与 concurrencyPolicy](https://github.com/kubernetes/kubernetes/blob/4ce5a8954017644c5420bae81d72b09b735c21f0/staging/src/k8s.io/api/batch/v1/types.go#L373-L432)
- [Kubernetes 1.24 `RestartPolicy`：Always、OnFailure 与 Never](https://github.com/kubernetes/kubernetes/blob/4ce5a8954017644c5420bae81d72b09b735c21f0/staging/src/k8s.io/api/core/v1/types.go#L2679-L2689)
- [Kubernetes 1.24 `PodSpec`：容器重启策略与 Pod deadline](https://github.com/kubernetes/kubernetes/blob/4ce5a8954017644c5420bae81d72b09b735c21f0/staging/src/k8s.io/api/core/v1/types.go#L3085-L3110)
