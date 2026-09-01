---
title: "YARN 队列有空闲资源为什么任务还在等：先看内存与 vCore 的资源形状"
date: "2021-03-18 14:42:31"
updated: "2021-03-18 14:42:31"
categories:
- "资源调度"
tags:
- "YARN"
- "CapacityScheduler"
- "资源治理"
description: "从 Hadoop 3.3.0 的 DefaultResourceCalculator 与 DominantResourceCalculator 源码解释 YARN 队列容量、Container 请求和资源碎片之间的关系。"
cover: /images/articles/yarn-queue-resource-shape.svg
top_img: /images/articles/yarn-queue-resource-shape.svg
permalink: /2021/03/18/yarn-queue-resource-shape/
comments: false
editorial_standard: expert-v1
---

YARN 页面显示队列还有容量，作业却长时间处于 ACCEPTED，或者 ApplicationMaster 已经启动、后续 Container 一直拿不到。遇到这种情况，只看“队列使用率 70%”往往不够。

调度器分配的不是一个抽象百分比，而是落到具体节点上的一组资源。任务要申请 8 GB 内存和 4 个 vCore，某个节点只剩 16 GB 内存但只有 2 个 vCore，这个节点对它仍然不可用。把所有节点的空闲内存相加，看起来还有很多容量，也不代表存在一个能容纳当前请求的节点。

还有一个更容易忽略的前提：CapacityScheduler 使用哪个 `ResourceCalculator`。Hadoop 3.3.0 默认的计算器只比较内存，切换到 `DominantResourceCalculator` 后，内存与 CPU 才以多维资源参与比较。两种模式下同一个“50% 队列”的含义并不完全相同。

![YARN 队列容量、请求形状与节点碎片](/images/articles/yarn-queue-resource-shape.svg)

<!-- more -->

## 默认调度计算器只看内存

`CapacitySchedulerConfiguration` 把 `DefaultResourceCalculator` 设为默认实现。继续看这个类，`compare()` 和 `computeAvailableContainers()` 都有同一句注释：`Only consider memory`。

```java
public int compare(Resource unused, Resource lhs, Resource rhs,
    boolean singleType) {
    return Long.compare(lhs.getMemorySize(), rhs.getMemorySize());
}

public long computeAvailableContainers(Resource available,
    Resource required) {
    return available.getMemorySize() / required.getMemorySize();
}
```

这意味着默认模式下，队列占用比例、资源比较和可容纳 Container 数量主要按内存计算。配置里虽然仍有 `yarn.scheduler.minimum-allocation-vcores` 和 `maximum-allocation-vcores`，Container 请求也带 vCore，但不能由此推断队列公平性已经按 CPU 做了隔离。

这是很多“CPU 已经打满，队列看起来却没满”的根源。调度器按内存判断还有空间，节点上的进程却在争抢 CPU；或者某类作业申请了偏小的 vCore 数，资源声明与实际计算负载不匹配，队列指标仍然显得健康。

我排查时会先把这个配置抄出来，而不是从 UI 猜：

```xml
<property>
  <name>yarn.scheduler.capacity.resource-calculator</name>
  <value>org.apache.hadoop.yarn.util.resource.DefaultResourceCalculator</value>
</property>
```

如果属性没有显式配置，也要按源码默认值理解，不能因为 capacity-scheduler.xml 里搜不到就当它不存在。

## DRF 看的是占比最高的那一维

`DominantResourceCalculator` 使用 Dominant Resource Fairness 的思路。对一个用户或队列，分别计算已用内存占集群内存的比例、已用 CPU 占集群 CPU 的比例，取其中最大的一个作为 dominant share。

假设集群有 100 GB 内存和 100 个 vCore：

- 队列 A 使用 40 GB、10 vCore，dominant share 是 40%；
- 队列 B 使用 20 GB、50 vCore，dominant share 是 50%。

队列 A 的绝对 CPU 用量更低，但它的主导资源是内存；队列 B 的主导资源是 CPU。DRF 比较的是各自最紧张的维度，不是把内存与 CPU 简单相加。源码的 `ratio()` 也正是遍历可计数资源，返回各维比例的最大值。

这适合 CPU 型和内存型任务混跑的集群。不过切换计算器不是改一行配置就结束。原来只按内存设计的队列 capacity、用户限制和告警阈值都要重新验证；应用提交的 vCore 请求若长期失真，DRF 只会把错误声明纳入公平计算，不能自动识别真实 CPU 消耗。

我会先在历史运行数据上回放资源声明：按队列统计已分配内存、vCore 与节点实际 CPU 使用，找出“声明 1 core、长期吃满多个核”或“声明很大、实际长期空闲”的任务，再讨论是否启用 DRF。资源模型换得再正确，申请值不可信也没有用。

## 最小分配会把请求向上取整

YARN 对每个 Container 的资源请求有最小值与最大值。Hadoop 3.3.0 的默认配置中，内存最小 1024 MB、最大 8192 MB，vCore 最小 1、最大 4；生产环境通常会按机器规格重新配置。

低于最小值的请求会被抬到最小值，高于最大值则抛出 `InvalidResourceRequestException`。`DefaultResourceCalculator.normalize()` 还会依据 step factor 向上取整，并限制在最大值以内。

如果最小内存粒度设为 2 GB，一个只需要 600 MB 的轻量 Container 仍按 2 GB 分配。单个任务看不出问题，几百个短任务同时运行时，取整损耗会直接反映为可并发 Container 数下降。反过来，把粒度压得过小，会让调度对象更多，资源管理复杂度也上升。

所以最小分配不该沿用某份“最佳实践”模板。我会从实际 Container 请求分布开始，看 P50、P90 以及高频规格，再选择能覆盖主要请求、又不会产生明显取整浪费的粒度。内存与 vCore 要一起看，不能只优化其中一列。

每个队列还可以设置 `maximum-allocation-mb` 和 `maximum-allocation-vcores`，它们覆盖集群级上限，但不能超过集群上限。这个约束适合阻止普通批处理队列申请超大 Container，也可能让一个配置正确的大内存任务在提交阶段直接失败。排查时要同时检查集群级和队列级上限。

## 总空闲不等于当前请求能放下

下面是一个刻意简化的例子：三个节点各剩 6 GB 内存和 1 个 vCore，集群总计还剩 18 GB、3 vCore。一个请求 8 GB、1 vCore 的 Container 仍然无处可放，因为任何单节点都缺少足够内存。

反过来也一样。节点剩余内存充足，但 vCore 被分散占用，4-core Container 会一直等。页面如果只显示集群总资源，会把这种节点碎片伪装成“明明有资源”。

队列容量是另一个边界。CapacityScheduler 的 capacity 是保证容量，在其他队列空闲时可以弹性使用更多资源；`maximum-capacity` 才限制上界。因此“队列已经超过 100%”不一定是异常，它可能正在借用空闲容量。等保证容量不足的队列重新产生需求，资源会在 Container 自然结束或启用抢占后逐步归还。

排队原因至少要按下面的顺序拆开：

1. ApplicationMaster 是否受 `maximum-am-resource-percent` 限制，导致应用还在 ACCEPTED；
2. Container 请求是否超过集群或队列最大分配；
3. 当前 ResourceCalculator 如何比较资源；
4. 队列、用户限制和 maximum-capacity 是否允许继续分配；
5. 是否存在一个具体节点同时满足内存、vCore、标签与本地性条件。

把这些问题混成一个“资源不足”，后续只会不断扩大队列 capacity，真正的节点碎片和请求规格却没有变化。

## 我会保留一份可复算的资源快照

只截 ResourceManager 页面不够。资源等待会随着 Container 结束迅速变化，过几分钟再看已经不是同一个现场。我更习惯在作业等待时保存一份快照：应用与 attempt 状态、pending resource、每个 Container 的 capability、队列 guaranteed/max/used/pending、各 NodeManager 的 total/allocated/available，以及调度器资源计算器配置。

有了这些数据，就可以回答一个很具体的问题：在当时那一刻，哪些节点为什么放不下这个请求。是内存少 1 GB、CPU 少 1 core，还是队列/用户上限挡住了分配。这个结论可以复算，也能用调整后的参数做对照。

资源治理最后要落到规格收敛。平台允许任意内存和 vCore 组合时，节点很容易被切成大量难以利用的边角。根据机器规格和工作负载沉淀几档常用 Container 形状，比让每个任务自由填写数字更容易提高装箱效率。特殊大内存任务可以进入单独队列和节点池，不必让整个共享集群为少数任务保留碎片。

“队列还有资源”只描述了一个聚合结果。要解释任务为什么在等，必须把资源计算方式、请求规格和节点形状放到同一张图里。

## 对照源码与文档

- [`CapacitySchedulerConfiguration`：默认使用 DefaultResourceCalculator](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-server/hadoop-yarn-server-resourcemanager/src/main/java/org/apache/hadoop/yarn/server/resourcemanager/scheduler/capacity/CapacitySchedulerConfiguration.java#L213-L219)
- [`DefaultResourceCalculator`：资源比较与可用 Container 数只考虑内存](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-common/src/main/java/org/apache/hadoop/yarn/util/resource/DefaultResourceCalculator.java#L39-L50)
- [`DominantResourceCalculator`：dominant share 的定义](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-common/src/main/java/org/apache/hadoop/yarn/util/resource/DominantResourceCalculator.java#L35-L51)
- [`DominantResourceCalculator.ratio()`：取多维资源比例最大值](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-common/src/main/java/org/apache/hadoop/yarn/util/resource/DominantResourceCalculator.java#L403-L415)
- [CapacityScheduler 3.3.0 文档：两种 ResourceCalculator 的区别](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-site/src/site/markdown/CapacityScheduler.md#L433-L440)
- [CapacityScheduler 3.3.0 文档：队列容量与单 Container 上限](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-site/src/site/markdown/CapacityScheduler.md#L119-L135)
- [`yarn-default.xml`：默认最小与最大分配](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-common/src/main/resources/yarn-default.xml#L404-L437)
