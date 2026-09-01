---
title: "HDFS 小文件治理为什么不能只做定时合并：先查文件是怎么产生的"
date: "2021-02-25 10:15:05"
updated: "2021-02-25 10:15:05"
categories:
- "大数据平台"
tags:
- "HDFS"
- "小文件治理"
- "数据平台"
description: "结合 Hadoop 3.3.0 的 NameNode、concat 与 HAR 实现，说明 HDFS 小文件真正消耗什么，以及数据平台如何从源头控制、存量改写和回滚验证。"
cover: /images/articles/hdfs-small-files-governance.svg
top_img: /images/articles/hdfs-small-files-governance.svg
permalink: /2021/02/25/hdfs-small-files-governance/
comments: false
editorial_standard: expert-v1
---

一说 HDFS 小文件治理，最常见的动作是安排一个夜间任务，把昨天的文件再合并一次。这个办法能让目录暂时好看一些，却很容易变成另一条长期运行的数据链路：白天持续制造小文件，晚上再花计算和 IO 把它们重写。

我不太赞成先上合并任务。小文件是一种结果，产生它的地方可能是过细的 Hive 分区、过多的 Reducer、流任务滚动过快，也可能是同步工具为每个并发通道各写一个文件。没有先找到生产者，存量清理得越勤，平台越难看清真正的写入模型。

这篇文章以 Hadoop 3.3.0 的文档和源码为准，先确认小文件到底给 HDFS 增加了什么负担，再讨论 `concat`、HAR 和重写任务各自适合做什么。

![HDFS 小文件从发现到治理的闭环](/images/articles/hdfs-small-files-governance.svg)

<!-- more -->

## 小文件占用的不是一个完整 block

HDFS 默认 block 较大，但“1 KB 文件也会浪费 128 MB 磁盘”并不准确。HDFS 把文件切成一个或多个 block，最后一个 block 可以小于配置的 block size。文件实际只有 1 KB，不会因为 block size 配成 128 MB，就在 DataNode 上预先写满 128 MB 数据。

小文件真正麻烦的地方是元数据数量。HDFS 3.3.0 的设计文档写得很直接：NameNode 维护文件系统 namespace，也维护文件到 block 的映射；整个 namespace 和 block map 保存在内存里。文件越多，inode、block、目录项和 block 位置信息就越多。精确到“每个文件占多少字节”的固定数字反而不可靠，它会随 Hadoop 版本、JVM 对象布局、文件属性和副本信息变化。

这类压力不只表现为 NameNode 堆内存上涨。一个分区下有几万个文件时，列目录、获取文件状态和生成计算任务切片都会产生更多 RPC 与对象。真正读数据时，每个小文件通常还带来打开文件、定位 block 和调度 task 的固定成本。数据量可能只有几十 GB，启动和调度时间却比扫描本身更长。

所以我会同时看两类指标：一类是 NameNode 的 namespace、block 和 RPC 状态；另一类是消费作业的文件枚举耗时、input split 数量、task 数量和有效扫描吞吐。只看 HDFS 剩余容量，很难发现小文件已经开始拖慢平台。

## 先按目录和生产任务做一张账

治理前，我会把统计粒度落到“表 / 分区 / 生产任务”，而不是只给集群报一个小文件总数。至少要回答这些问题：

| 观察项 | 要解决的问题 |
| --- | --- |
| 每日新增文件数 | 小文件是否仍在增长，增长速度多快 |
| 文件大小中位数与 P95 | 是整体偏小，还是少量异常文件 |
| 单目录文件数 | 哪些分区给 listStatus 和调度带来压力 |
| 创建时间、属主、路径规则 | 能否反查到具体调度任务或写入组件 |
| 下游读取频率 | 应该立即治理，还是先处理高频路径 |
| 分区数据量与写并发 | 分区设计和并行度是否匹配 |

“小于 128 MB 都算小文件”也太粗。日增 20 MB、一个月才读一次的归档分区，与每小时写 20 MB、每天被几十个任务扫描的热分区，处理优先级完全不同。阈值应结合数据增长、读取方式和集群规模确定。

归因时最有用的不是文件名，而是生产链路。Hive 插入任务要看最终 Reducer 数和动态分区数量；数据同步任务要看 Writer 通道数；Flink 类流任务要看并行度、滚动策略和 checkpoint 对文件提交的影响。一个任务同时写 200 个分区，即使每个分区只落一个文件，也会在一次调度里产生 200 个文件。

我会先对增长最快的目录做采样，把路径映射回任务实例，再改生产配置。这样第二天复查“新增文件数”就能知道修改是否有效。先做存量合并，只能证明清理任务跑过，不能证明问题停了。

## 从写入端控制文件数量

写入端需要让“分区数据量、并行度、目标文件大小”能够对应起来，单纯追求更大的文件没有意义。

批任务中，如果一个日分区只有几百 MB，却因为上游并行度沿用默认值输出几十个文件，我会先收敛输出并行度。若数据按大量动态分区写入，还要检查业务是否真的需要这么细的分区。把低基数日期再切到小时、渠道、地区，目录数量和文件数量会一起放大。

流任务不能简单把并行度降到 1。并行度首先服务吞吐与故障恢复，文件大小应由 sink 的滚动策略、分桶方式和提交周期共同控制。滚动太频繁会产生小文件，滚动太慢又会增加恢复成本和数据可见延迟。这个取舍需要用实际每个并发分支的流量来算，而不是从集群 block size 反推一个统一参数。

平台层最好在任务发布时给出估算：

```text
预计单文件大小 ≈ 分区周期内数据量 / 实际写入分支数
实际写入分支数 = 并行度 × 同时命中的分区或桶数量
```

这个公式不追求精确，它的价值是提前暴露数量级错误。预计每个文件只有几百 KB 时，发布页面就应该提示用户检查分区与并行度，而不是等 NameNode 报警以后再治理。

## `concat` 不是通用压缩工具

HDFS 的 `concat` 很容易被理解成“把几个文件重新写成一个”。从 `FSDirConcatOp` 看，它实际调用 `INodeFile.concatBlocks()`，把源文件的 block 接到目标 inode 上，然后移除源 inode。数据 block 不需要重新经过客户端读取和写入，所以操作很快。

也正因为它是在元数据层拼 block，限制不少：源文件和目标文件必须在同一目录；源文件不能处于 snapshot 中，不能与目标相同，不能是空文件或正在写入；源文件的 preferred block size 不能大于目标文件；加密区也不允许执行。源码还会检查纠删码策略等属性是否匹配。

更重要的是，`concat` 不理解 Parquet、ORC 或文本记录的文件格式语义。它只是拼 block，不会重新编码数据、整理 stripe/row group，也不会更新 Hive 分区统计信息。拿它代替表文件 compaction，必须先证明目标文件格式允许这种物理拼接；不能因为 HDFS API 调用成功，就认为数据表一定可读。

对于需要真正减少文件并优化列式布局的表，我更倾向于用计算任务重写：读取旧分区，按目标文件大小重新分桶或合并，写入隔离的 staging 路径。它成本更高，但能走正常的序列化和文件格式 writer，验证边界也清楚。

## HAR 解决 namespace，不负责替你清理

Hadoop Archives（HAR）会把一批逻辑文件映射到 `_index`、`_masterindex` 和 `part-*` 文件上，对外暴露 `har://` 文件系统视图。大量冷小文件进入 HAR 后，可以减少底层 HDFS namespace 中的文件与 block 数量。

但 HAR 是不可变的。归档中的 rename、delete 和 create 都会报错，不适合还在持续追加的热分区。官方文档还特意说明：创建 archive 不会删除输入文件。想真正减少 namespace，用户必须在验证 archive 后自行删除原文件。

这两点决定了 HAR 更像冷数据封装，而不是日常表 compaction。若归档完成后忘记删原目录，NameNode 压力不会下降，反而多了一份 archive；若先删再验，又把一次治理变成了数据恢复事故的入口。

我的做法是把 HAR 放在低频、只读、生命周期清楚的目录上，并明确记录原路径、archive 路径、文件数、总字节数和验证结果。在线查询表或仍会补数的分区，不会为了降低文件数直接做 HAR。

## 存量改写必须有回滚点

存量小文件治理，本质上是一次数据迁移。即使数据在同一个 HDFS 集群，也要按迁移来做。

我会先冻结目标分区的写入或确认它已过补数窗口，然后把结果写入独立 staging 目录。校验至少包括文件格式可读、记录数、关键字段聚合、分区边界和总数据量；对金额、订单数这类核心指标，还要和原目录做业务口径对账。

通过以后再用 rename 切换目录：原目录改成带时间戳的备份名，staging 目录改成正式名。HDFS 的 rename 只处理 namespace，比跨集群复制更适合做短时间切换。备份目录保留一个明确的观察窗口，确认下游任务连续运行正常后再删除。

失败时也要知道停在哪一步。staging 校验失败，删 staging 并保留原目录；正式路径已切换但下游验证失败，就把新目录移开、原目录改回。不要在一个脚本里连续执行“合并、覆盖、删除”，中间没有状态记录，出了问题只能翻日志猜文件还剩在哪里。

小文件治理是否结束，要看三个结果能否同时成立：生产任务不再按原速度制造小文件，存量数据经过验证完成切换，NameNode 和下游扫描指标都出现持续改善。历史目录少了多少文件只是过程数据。少了其中任何一个，夜间合并任务都只是把问题推迟到下一天。

## 对照源码与文档

- [HDFS 3.3.0 架构文档：NameNode 管理 namespace 与 block 映射](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-hdfs-project/hadoop-hdfs/src/site/markdown/HdfsDesign.md#L52-L61)
- [HDFS 3.3.0 架构文档：namespace 与 block map 保存在内存](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-hdfs-project/hadoop-hdfs/src/site/markdown/HdfsDesign.md#L146-L153)
- [`FSDirConcatOp`：concat 的限制与检查](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-hdfs-project/hadoop-hdfs/src/main/java/org/apache/hadoop/hdfs/server/namenode/FSDirConcatOp.java#L39-L47)
- [`FSDirConcatOp.unprotectedConcat()`：拼接 block 并移除源文件](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-hdfs-project/hadoop-hdfs/src/main/java/org/apache/hadoop/hdfs/server/namenode/FSDirConcatOp.java#L230-L263)
- [Hadoop Archives：HAR 的结构与不可变约束](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-tools/hadoop-archives/src/site/markdown/HadoopArchives.md.vm#L30-L36)
- [Hadoop Archives：创建归档不会删除原文件](https://github.com/apache/hadoop/blob/aa96f1871bfd858f9bac59cf2a81ec470da649af/hadoop-tools/hadoop-archives/src/site/markdown/HadoopArchives.md.vm#L69-L72)
- [Apache Hadoop 3.3.0 发布说明](https://hadoop.apache.org/release/3.3.0.html)
