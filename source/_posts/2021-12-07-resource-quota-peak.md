---
title: "YARN 资源配额为什么不能按平均使用率分：用峰值重叠设计队列容量"
date: "2021-12-07 13:06:29"
updated: "2021-12-07 13:06:29"
categories:
- "资源调度"
tags:
- "YARN"
- "容量规划"
- "SLA"
description: "结合 Hadoop 3.3.0 CapacityScheduler 的保证容量、maximum-capacity、用户限制与抢占机制，说明共享集群怎样按峰值重叠和等待 SLA 设计配额。"
cover: /images/articles/resource-quota-peak.svg
top_img: /images/articles/resource-quota-peak.svg
permalink: /2021/12/07/resource-quota-peak/
comments: false
editorial_standard: expert-v1
---

给数据团队分 YARN 配额时，一个常见算法是统计上个月平均使用率，再按比例切队列。A 部门平均用了 40%，就给 40% capacity；B 部门平均 20%，就给 20%。报表看起来有数据依据，到了每天凌晨，两个部门的关键任务一起跑，队列还是排满。

平均值描述长期资源消耗，不描述任务在 SLA 窗口内是否碰到一起。一个队列每天只忙两小时，平均使用率很低；这两小时如果正好承担日结、报表和下游出数，它需要的保证容量可能比全天平滑运行的队列更高。

CapacityScheduler 的 capacity 本来就不是一堵静态资源墙。它给队列保证一部分容量，空闲资源可以被其他队列借用，`maximum-capacity` 再限制弹性上界。配额设计的重点应该是关键时间窗口内的并发需求、可等待时间和资源回收速度，而不是把集群按月均比例永久切开。

![YARN 队列按峰值重叠与 SLA 设计容量](/images/articles/resource-quota-peak.svg)

<!-- more -->

## Capacity 是保证，不是预留空置机器

Hadoop 3.3.0 的 CapacityScheduler 文档把队列 capacity 定义为集群资源的一部分。队列内应用可以使用这部分保证容量；其他队列有空闲时，也可以暂时超过自己的 capacity。`maximum-capacity` 限制它最多借到哪里。

因此队列使用率超过 100% 不一定异常。它可能在借用父队列中的空闲资源，提高整个集群利用率。真正要观察的是：别的队列产生需求后，借出去的资源能否在业务允许的时间内归还。

若没有开启 preemption，已经分出去的 Container 通常要等自然结束，资源才会重新分配。一个借用资源的长任务每个 Container 运行数小时，即使保证队列突然有需求，也不能瞬间拿回。官方文档中，ResourceManager 的调度监控默认关闭；配置抢占策略后，才会按周期计算并回收超出保证容量的部分。

这就是“capacity 配对了，关键任务仍然等”的常见原因。纸面上保证 30%，运行中 30% 已被其他队列的长 Container 占用，回收又没有生效，保证只是最终会收敛的目标，不是毫秒级预留。

我会为保证容量增加一个时间维度：从队列产生 pending demand 到恢复 guaranteed capacity，P95 需要多久。只看当前 used/capacity 比例，看不到资源归还是否符合 SLA。

## 配额基线要看重叠峰值

容量规划的数据粒度至少到 5 或 10 分钟。按天或按月平均，会把凌晨 01:00 到 02:00 的尖峰摊平。

我会先把每个队列的 demand、allocated、pending 和完成 SLA 放在同一条时间线上。Demand 是应用想要的资源，Allocated 是实际拿到的资源，两者不能混用。队列只分到 20%，allocated 曲线顶在 20%，并不能说明它只需要 20%；pending 可能一直在积压。

然后找峰值重叠：A 的日批、B 的模型训练和 C 的临时报表是否经常在同一个窗口出现。单独看各队列 P95 再相加可能过度配置，因为峰值未必同时发生；直接看集群总平均又会低估冲突。更合理的是基于历史时间片重放队列需求，观察各 SLA 窗口的联合分布。

一个简化的容量基线可以这样算：

```text
保证容量 = 在目标等待 SLA 内必须启动的工作负载需求
弹性上界 = 保证容量 + 可借用的非关键/突发需求
```

这不是一个固定公式。短任务可以在窗口内排队，交互查询可能要求几十秒启动；同样 100 core-hour，1 小时内完成和 10 小时内完成需要的并行容量完全不同。

规划结果还要落到内存与 vCore 两个维度。前一篇已经说明，默认 `DefaultResourceCalculator` 主要按内存比较；启用 DRF 后，CPU 型队列的主导资源才会进入公平计算。配额报表只画 memory%，CPU 已经饱和时会得出错误结论。

## Maximum-capacity 是防扩散边界

共享集群有空闲时，让队列借用资源通常是好事。没有上界也会带来两个问题：一个批量补数把所有空闲 Container 占完，新到的交互任务需要等待回收；一个故障任务不断扩并发，把压力传到 HDFS、Shuffle 和目标数据库。

`maximum-capacity` 适合控制这种扩散。它不是越接近 capacity 越安全。上界过紧会制造资源孤岛，其他队列空闲时也不允许任务加速；上界 100% 又可能让单个队列占满集群。要结合 Container 时长、抢占代价和外部系统承载能力决定。

每个队列还能限制单 Container 的 `maximum-allocation-mb` 与 `maximum-allocation-vcores`。这解决的是单次请求规格，不等于限制队列总量。反过来，队列 maximum-capacity 足够大，单 Container 上限太小，大内存作业仍然无法提交。平台页面要把两层限制分开展示。

我也会区分“常态突发”和“异常扩散”。某队列每周固定补数，应该进入容量计划；一个 SQL 因笛卡尔积突然申请数千 Container，应该由查询防护、用户限制和最大并发拦截，不能把它算成未来必须保障的峰值。

## 用户限制和 AM 资源会让任务在入口排队

队列有资源，某个用户仍可能拿不到，是因为 CapacityScheduler 还有 `minimum-user-limit-percent` 与 `user-limit-factor`。它们控制单个用户在队列中能占多少，避免一个账号垄断共享队列。

如果所有调度任务都使用同一个技术账号提交，用户公平会失去意义：几十个业务团队在 YARN 看起来是同一个 user。要么把项目/租户映射到可区分身份，要么在平台层做更细的并发与配额控制。只建很多逻辑项目、底层都用 `hadoop` 用户，队列无法按组织公平。

ApplicationMaster 也占资源。`maximum-am-resource-percent` 控制队列中可用于 AM 的比例，达到上限后，新应用会停在 pending/ACCEPTED，即使普通 task Container 还有资源。大量小作业同时提交时，每个作业数据量不大，AM 总量却可能先成为入口瓶颈。

因此排队看板应拆成至少三类：

- 因 AM 资源上限尚未启动；
- Application 已运行，但 task Container 因队列/用户限制等待；
- 队列允许分配，但没有满足资源形状或标签的节点。

三类问题都显示成“资源不足”，管理员只能反复提高 capacity，实际瓶颈可能完全没动。

## 抢占策略先观察，再决定杀谁

Hadoop 3.3.0 的 `ProportionalCapacityPreemptionPolicy` 提供 monitoring interval、kill 前等待时间、单轮最大抢占比例、deadzone 和自然完成因子等参数。它不是一个简单的开关。

回收太慢，保证队列错过 SLA；回收太激进，长任务刚计算完的数据被杀，重新调度后浪费更多资源。流任务、有状态作业和大 Shuffle stage 的抢占成本又比短 Map task 高。

我会先使用 `observe_only` 运行策略，记录如果启用会选择哪些 Container、预计回收多少、对应哪些业务任务。把这份模拟结果与 SLA 事件对照，再逐步开启实际抢占。若策略持续选中高成本 Container，需要调整队列、任务粒度或优先级，不是继续缩短 kill 等待。

抢占后的效果也要闭环：被保障队列 pending 是否下降，完成时间是否改善，被抢占任务增加了多少重算时间。只统计“抢占了 300 个 Container”，无法判断策略有没有帮助业务。

## 配额调整需要一次受控回放

改 capacity 以后看第二天有没有投诉，不算验证。我会选取一段代表性的高峰，把各队列 application 到达时间、Container 请求和运行时长做匿名化回放，比较旧配置与新配置下的启动延迟、完成时间、借用量和抢占量。

线上变更则保留前后版本和明确回退条件。CapacityScheduler 支持运行时修改队列属性，但配置能 refresh 成功，只证明语法有效。需要继续观察 guaranteed capacity 恢复时间、pending resource、AM 排队和关键作业 SLA。

配额也不是一次性项目。任务新增、数据量增长、机器规格和业务窗口都会变化。每月用最近数据重算需求分布，按季度审查队列结构；真正的突发事件单独标记，不让一次故障把长期容量基线拉高。

一个好的共享队列方案，不是让每个部门永远占着一块机器，而是在它真正需要资源的窗口给出可预测保证，平时又允许别人使用空闲容量。平均使用率只能帮助看成本，峰值重叠和等待 SLA 才决定配额。

## 对照源码与文档

- [CapacityScheduler 3.3.0：保证容量、弹性与多租户设计](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-site/src/site/markdown/CapacityScheduler.md#L28-L53)
- [CapacityScheduler 3.3.0：capacity、maximum-capacity 与用户限制](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-site/src/site/markdown/CapacityScheduler.md#L119-L135)
- [CapacityScheduler 3.3.0：AM resource percent 与应用并发限制](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-site/src/site/markdown/CapacityScheduler.md#L137-L145)
- [CapacityScheduler 3.3.0：抢占策略与 observe_only](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-site/src/site/markdown/CapacityScheduler.md#L265-L283)
- [`CapacitySchedulerConfiguration`：默认 ResourceCalculator 与配置入口](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-server/hadoop-yarn-server-resourcemanager/src/main/java/org/apache/hadoop/yarn/server/resourcemanager/scheduler/capacity/CapacitySchedulerConfiguration.java#L213-L219)
- [`yarn-default.xml`：Container 最小/最大内存与 vCore 分配](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-yarn-project/hadoop-yarn/hadoop-yarn-common/src/main/resources/yarn-default.xml#L404-L437)
