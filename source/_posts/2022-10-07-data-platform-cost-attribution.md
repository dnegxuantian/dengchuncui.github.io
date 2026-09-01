---
title: "数据平台成本怎么归到任务：别再只看队列和部门总账"
date: "2022-10-07 17:23:28"
updated: "2022-10-07 17:23:28"
categories:
- "资源治理"
tags:
- "成本治理"
- "Kubernetes"
- "Apache YARN"
description: "结合 Hadoop YARN 3.3.4 的 resource-seconds 与 Kubernetes 1.24 的 requests/limits，说明如何把计算、存储、网络和失败成本归因到作业实例。"
cover: /images/articles/data-platform-cost-attribution.svg
top_img: /images/articles/data-platform-cost-attribution.svg
permalink: /2022/10/07/data-platform-cost-attribution/
comments: false
editorial_standard: expert-v1
---

数据平台做成本治理，最容易拿到的是部门每月用了多少机器，最难回答的是：哪条任务、哪个业务日期、哪次失败重试花了这些钱。没有实例级归因，平台只能要求所有团队统一降资源，真正浪费的作业反而躲在平均数里。

我会先做一份可追溯的成本账本，把 `project -> job -> instance -> attempt -> engine application/pod` 串起来，再谈优化。成本治理不是给资源账单换一套图表，而是能从一笔费用追到真实运行证据，也能从一次重跑预估它会增加多少资源和存储开销。

![数据平台从业务身份到优化动作的成本归因链路](/images/articles/data-platform-cost-attribution.svg)

<!-- more -->

## 归因主键必须从调度实例进入执行端

YARN 看到的是 application ID，Kubernetes 看到 Job/Pod UID，Spark 还有 driver/executor，Flink 有 JobManager/TaskManager。它们都不是业务主键。同一条调度实例可能提交两次 application，一次 Pod 重建也会生成新的 attempt。

因此提交适配层必须把 `project_id`、`job_id`、`instance_id`、`attempt_no` 和 owner 写入执行系统。Kubernetes 用 labels 保存可查询的短标识，用 annotations 放较长但不敏感的元数据；YARN 可以用 application tags/name，并在平台数据库保存反向映射。

只靠任务名匹配不可靠。名称会改、并行补数会重复、测试任务可能复制生产名字。UID 映射要在提交成功时固化，状态回收再补齐 started/finished time、queue/namespace、node pool 与终止原因。

这条链路还要覆盖失败前的资源。任务创建容器后 OOM、运行两小时后 SQL 报错、反复重试三次，所有 attempt 都应计费。只把最终成功 attempt 记到账本，会把稳定性问题的成本藏掉。

## YARN 的 resource-seconds 是分配量，不是 CPU 使用率

Hadoop YARN 3.3.4 的 `ApplicationResourceUsageReport` 提供 memory-seconds 和 vcore-seconds。源码注释定义得很清楚：它们是应用已分配内存 MB / vcores 乘运行秒数的累计值。

例如一个应用分配 10 vcores 运行 600 秒，得到 6000 vcore-seconds，不代表 CPU 真忙了 6000 core-seconds。任务大部分时间等待 IO，计入的分配成本仍然存在，因为资源调度器在这段时间为它保留容量。

我会同时保存 allocated 与 actual 两套指标。allocated 用来做内部资源成本与队列容量归因；actual CPU time、RSS、network/disk IO 用来判断效率。两者的差值是 right-sizing 线索，不应偷偷用 actual 替换 allocated，让账单看起来更低。

YARN 的 `resourceSecondsMap` 还能容纳自定义资源。若集群有 GPU 或其他资源类型，账本不能把所有东西都折成 vcore。原始 resource name、quantity-seconds 与计价版本要保留，方便日后重新定价。

## Kubernetes 要区分 request、limit 和 usage

Kubernetes `ResourceRequirements` 把 requests 定义为所需的最小计算资源，limits 定义允许的最大量。Scheduler 按 requests 做放置，运行期实际使用可能低于 request，也可能在 limit 内突发。

对于共享集群，我会提供三种视图：

```text
capacity cost：request × duration，反映占用的可调度容量
usage cost：actual usage × time，反映真实消耗
risk headroom：limit/request 与峰值，反映超卖和 OOM 风险
```

只按 usage 分摊，request 配得过大的团队不用为挤占容量负责；只按 request，又看不出运行效率。平台可以选择 request 做 chargeback、usage 做优化分析，但要把规则公开，不能在月中换口径。

Pod 生命周期也要处理准确。Pending 但尚未调度的 Pod 没占 Node 计算资源，Running 容器才积累；终止重建后按各 Pod UID 分段；sidecar 和 init container 的成本是否算入任务，要有一致规则。Job 删除前应先把资源与标签数据固化。

## 存储成本要按 bytes-days，而不是当前大小

一张表今天占 10 TB，不能直接把整月存储费用按 10 TB 计算。分区逐日增长、过期删除、快照保留和临时目录都会改变占用。更合理的基础单位是 bytes-hours 或 bytes-days。

表格式还要区分逻辑数据量与物理占用。Iceberg 历史 snapshots 会继续引用旧 data files；compaction 在新旧 snapshot 共存期间短暂产生双份文件；orphan files 不在当前表大小里，却仍占对象存储。账本应从存储 inventory 或内容摘要采集物理 bytes，再用 metadata 关系归到表、snapshot/maintenance job。

共享 warehouse 里无法归属的路径进入 `unallocated_storage`，不能悄悄按表当前大小比例分摊。unallocated 持续增长本身就是治理指标，说明路径、owner 或清理流程缺失。

缓存、副本和跨可用区复制也要算。业务表逻辑 1 TB、三副本物理 3 TB，chargeback 是按逻辑数据鼓励平台承担副本，还是按物理数据让业务感知可靠性成本，需要提前定义。两种都可以，关键是不能混用。

## 网络与外部服务不能永远藏在平台公摊

跨区读写、对象存储请求、Kafka 流量、日志索引和外部 API 都可能成为大头。按 CPU/memory 分摊这些成本，会把网络密集任务的费用错误地转嫁给计算密集任务。

能直接关联 instance ID 的请求按使用量归因；只能拿到 namespace/bucket/topic 维度的，先归到项目；控制面、监控和空闲节点属于 shared cost，再按公开规则分配。共享成本必须单列，让使用方能看见“直接成本”和“平台公共成本”。

单价也要版本化。节点按需价、包年包月折算、Spot 折扣、存储层级和网络方向都会变化。每条成本记录引用 `price_snapshot_id`，而不是查询报表时拿今天价格乘历史用量。这样财务对账与技术模拟可以共存。

## 成本报表要同时展示价值和失败

成本最高的任务不一定最该优化。一个核心日结任务每天稳定处理全公司订单，贵但有价值；一个没人消费的临时报表每次只花几十元，却运行上万次，浪费更明显。

我会给任务提供四类指标：总成本、每成功批次成本、每 GB 输入/每百万行成本、失败与重试成本。再关联下游消费者、SLA 和最后访问时间。这样能区分“量大所以贵”“单位效率差”“稳定性差导致贵”“已经没人用还在贵”。

优化动作也要能回归。调小 request 后，比较单位成本、排队时间和 OOM；减少 Spark partitions 后，检查 runtime 与 shuffle；调整文件布局后，检查查询扫描量与维护成本。只看到本月下降，可能是业务数据少了，不是优化有效。

预算告警则基于实例预测。补数提交前，根据历史同类分区的 resource-seconds 和 bytes 估算费用，超过阈值先展示影响，而不是月底发现账单翻倍。预测区间要带置信度，不能给一个假精确数字。

## 先做 Showback，再做 Chargeback

第一阶段我建议只展示不扣费。让 owner 核对任务映射、资源口径和共享分摊，解决 missing owner、重复 application、时区与价格问题。归因准确率不到 95% 就直接 chargeback，会把团队精力消耗在争账单上。

Showback 稳定后，再为可控资源做配额和预算。费用异常能点到 instance、attempt、Pod/application 与原始指标，用户才能自助验证。平台也要公布无法精确归因的边界，不把估算伪装成计量事实。

数据平台成本治理最终要推动工程动作：减少无效重跑、修正资源申请、调整文件与模型、下线无人消费任务。能追到任务实例的账本，才有资格支撑这些决定；部门总账只能告诉我们钱花了，不能告诉我们为什么花。

## 对照源码与文档

- [Hadoop 3.3.4 `ApplicationResourceUsageReport`：used、reserved、needed resources](https://github.com/apache/hadoop/blob/a585a73c3e02ac62350c136643a5e7f6095a3dbb/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-api/src/main/java/org/apache/hadoop/yarn/api/records/ApplicationResourceUsageReport.java#L89-L123)
- [Hadoop 3.3.4：memory-seconds 与 vcore-seconds 的定义](https://github.com/apache/hadoop/blob/a585a73c3e02ac62350c136643a5e7f6095a3dbb/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-api/src/main/java/org/apache/hadoop/yarn/api/records/ApplicationResourceUsageReport.java#L125-L159)
- [Hadoop 3.3.4：通用 resourceSecondsMap](https://github.com/apache/hadoop/blob/a585a73c3e02ac62350c136643a5e7f6095a3dbb/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-api/src/main/java/org/apache/hadoop/yarn/api/records/ApplicationResourceUsageReport.java#L233-L240)
- [Kubernetes 1.24 `ResourceRequirements`：limits 与 requests 的 API 语义](https://github.com/kubernetes/kubernetes/blob/4ce5a8954017644c5420bae81d72b09b735c21f0/staging/src/k8s.io/api/core/v1/types.go#L2270-L2282)
- [Kubernetes 1.24 `ObjectMeta`：可组织、分类和筛选资源的 labels](https://github.com/kubernetes/kubernetes/blob/4ce5a8954017644c5420bae81d72b09b735c21f0/staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go#L217-L228)
