---
title: "Compaction 为什么要做成持续服务：从小文件阈值到 File Group 提交"
date: "2022-05-14 18:05:24"
updated: "2022-05-14 18:05:24"
categories:
- "湖仓架构"
tags:
- "Apache Iceberg"
- "Compaction"
- "表维护"
description: "结合 Apache Iceberg 0.13.1 的维护文档与 RewriteDataFiles API，说明 Compaction 的候选选择、文件分组、并发提交、收益验收和服务化治理。"
cover: /images/articles/compaction-as-service.svg
top_img: /images/articles/compaction-as-service.svg
permalink: /2022/05/14/compaction-as-service/
comments: false
editorial_standard: expert-v1
---

很多团队第一次治理小文件，会加一个凌晨两点的 Spark 脚本：扫描昨天的分区，把文件合到 512 MB。刚上线时效果明显，过一阵又会遇到任务跑不完、与实时写入冲突、刚合完第二天又碎了，最后脚本变成一个没人敢停的定时黑盒。

我更愿意把 Compaction 看成表的持续维护服务。它不是“每天执行一次重写”，而是一条有输入指标、候选选择、预算、提交证据和效果验收的控制循环。表什么时候需要整理、整理哪部分、允许花多少资源、失败后如何继续，都应该可计算。

![Compaction 从表体检到效果验收的服务闭环](/images/articles/compaction-as-service.svg)

<!-- more -->

## 小文件数量不是唯一触发条件

Iceberg 0.13.1 的维护文档指出，更多 data files 会增加 manifest 元数据，并让查询承担更多文件打开成本；`rewriteDataFiles` 可以把小文件合并成较大的文件。这个方向没问题，但“文件小于 128 MB 就合并”仍然太粗。

冷分区有一千个 20 MB 文件，如果一年没人查询，立刻花一轮 TB 级 IO 未必划算。热分区只有几十个文件，但每个查询都要应用大量 delete files，重写收益反而更高。Compaction 的候选分数至少应包含：

```text
收益：减少文件数 + 减少 delete 合并 + 改善排序/裁剪 + 降低规划时间
成本：读取字节 + 写入字节 + 计算时长 + catalog 提交 + 冲突概率
```

我会把表指标分成三层。文件层看 size 分布、record count、delete count 和 partition；查询层看 scan planning time、opened files、实际读取比例和热点过滤字段；写入层看 commit 频率、平均每次新增文件数以及更新模式。只有文件层，服务只能机械合并；加上读写层，才能优先处理真正影响 SLA 的区域。

目标文件大小也不是全平台一个常量。对象存储吞吐、查询 split、压缩率和更新热点都会影响合适值。写入频繁的近线分区可以保留较小文件以降低重写冲突，进入稳定期后再合到更大的目标尺寸。

## File Group 是资源与失败隔离单元

Iceberg 的 `RewriteDataFiles` 会按 partition，再按大小把输入拆成 file groups。`max-file-group-size-bytes` 限制单组重写的数据量，源码注释明确说明，这是为了避免 TB 级分区一次排序重写耗尽集群资源；一个 group 不会跨输出分区。

这个边界很适合平台化。调度服务不用把“一张表 compaction”当成不可分割的大任务，而是先规划 groups，为每组估算 input bytes、文件数、预计输出文件数和资源，再按预算并发投递。

如果一组 100 GB、集群最多同时跑两组，那么峰值读写和 shuffle 比较容易控制。若直接对全表运行，Spark DAG 里可能同时铺开大量分区，既抢占业务计算资源，也增加对象存储请求和 Catalog 提交压力。

File group 还提供失败隔离。某个分区包含损坏文件或遇到并发冲突，不应迫使已经完成的其他独立分区全部重算。但开启 partial progress 前要理解它的代价：每一批成功 group 会产生独立 Iceberg commit，snapshot 与 metadata 增长更快，读者会看到逐步改善而不是一次切换。

`partial-progress.enabled` 不是“容错开关”。启用后必须记录每次 commit 对应的 group、重写文件数、新文件数和失败原因；同时用 `partial-progress.max-commits` 给单次维护设置上限。否则一次维护可以在 Catalog 留下一长串难以解释的 snapshots。

## Bin-pack 与 Sort 解决的不是同一个问题

Bin-pack 主要改善文件尺寸。它把若干小文件重新打包到接近 target size，适合文件分布碎但数据布局尚可的表。Sort rewrite 还会按 sort order 重排记录，成本更高，却能让常用过滤字段的 min/max 范围更紧，提高文件裁剪。

如果用户经常按 `tenant_id, event_time` 查询，而实时写入按到达顺序落文件，同一 tenant 的数据可能散在大量文件里。单纯 bin-pack 只会把小文件变大，散布关系没有改变；sort rewrite 才可能减少真正扫描的数据量。

但排序不是免费的。它引入 shuffle、spill 与更长执行时间，也放大与并发更新冲突的窗口。选择 sort 前，我会先用查询日志证明过滤模式稳定，再在少量分区做 A/B：比较 rewrite 前后的 files selected、bytes scanned 和 p95 query latency，而不是只看平均文件大小。

对于 Merge-on-Read 表，还要把 delete 处理算进去。重写 data file 时需要应用有效 delete，生成干净的新数据；源码中的 `use-starting-sequence-number` 用起始 snapshot 的 sequence number 处理新文件，避免与更高序号的 equality deletes 冲突。维护任务不是离线清洁工，它必须服从表格式的并发语义。

## Compaction 会和正常写入争同一个提交点

Iceberg 用乐观并发提交 snapshot。Compaction 读取一组旧 data files，生成替代文件，提交前必须确认输入文件仍然有效。如果实时 overwrite 或另一轮 compaction 已经移除其中某个文件，本次 rewrite 不能直接覆盖最新状态。

Append-only 表上的普通流式追加与旧文件重写通常可以并存，但 metadata pointer 仍可能发生提交竞争。更新频繁的表更复杂：新的 position/equality delete 可能与正在重写的文件有关，错误处理会造成已删除记录重新出现。

所以服务要做调度避让。对每张表建立 writer window、maintenance window 与允许并发的操作矩阵：append 与老分区 bin-pack 可以并发，针对同一活跃分区的 overwrite、row-level update 和 sort rewrite 应尽量错开。冲突率持续升高时，减少并发、缩小 group 或后移冷却时间，比无限增加 commit retry 更有效。

我还会限制同一张表同时只有一个 planner。多个 compaction 任务各自扫描后选出重叠文件，即使执行资源充足，也会在提交时互相打掉。全局服务可以并行维护不同表，同表内部则用 file-group lease 防止输入集合重叠。

## 维护项要分开，不要揉成一个“大清理”

Rewrite data files、rewrite manifests、expire snapshots 和 remove orphan files 解决四类不同问题。

Rewrite data files 改善数据文件尺寸或布局，会生成新 snapshot。Rewrite manifests 重组 metadata tree，适合写入顺序与查询过滤不一致、manifest 规划效率差的表。Expire snapshots 缩短可 time-travel 的历史，并让不再被任何保留 snapshot 引用的文件具备回收条件。Remove orphan files 才是查找未被 metadata 引用的文件。

执行顺序和保留策略必须明确。刚写出的文件在 commit 前也暂时不被 table metadata 引用，如果 orphan retention 小于最长写入时间，清理任务可能删掉正在进行的写入。Iceberg 0.13.1 文档还特别提醒，路径字符串表现不一致时，文件系统 listing 与 metadata 中的路径无法匹配，RemoveOrphanFiles 可能导致数据丢失。

我不会把这四项塞进同一个 catch-all 脚本。每项单独定义 SLA、权限和 dry-run 结果，尤其删除类动作要先输出候选清单、保留时间与路径规范化检查，再执行实际删除。

## 验收要回答“值不值得”，不只回答“成功了”

一轮 Compaction 的 SUCCESS 至少要包含：选中多少 file groups、读取/写入多少字节、重写多少旧文件、生成多少新文件、提交了哪些 snapshot、失败或跳过哪些 groups。只有 Spark job exit 0 不够。

效果验收分两次。提交后立刻检查文件 size 分布、delete file 关联数和 snapshot summary，确认物理结果符合计划；经过一个查询周期后，再看 planning time、opened files、scan bytes 和 p95 latency 是否改善。

如果每周花 20 TB IO，只把平均文件从 40 MB 合到 80 MB，查询几乎没变化，这个策略不值得继续。如果目标文件很漂亮，但流写两小时后又回到原状，应修上游 writer 的并行度、distribution 和 commit 频率，而不是加密 Compaction 调度。

服务化的关键不是长期运行一个进程，而是形成闭环：发现债务、选择收益最高的区域、在预算内执行、保留提交证据、验证效果，再调整下一轮策略。做到这一步，Compaction 才从“夜间脚本”变成表生命周期的一部分。

## 对照源码与文档

- [Iceberg 0.13.1 Maintenance：小文件与 `rewriteDataFiles`](https://github.com/apache/iceberg/blob/a78aa2dbdb98634f26066c457cc1aef93166be9f/site/docs/maintenance.md#L105-L127)
- [Iceberg 0.13.1 Maintenance：snapshot expiration 与文件引用边界](https://github.com/apache/iceberg/blob/a78aa2dbdb98634f26066c457cc1aef93166be9f/site/docs/maintenance.md#L23-L58)
- [Iceberg 0.13.1 Maintenance：RemoveOrphanFiles 的 retention 与路径风险](https://github.com/apache/iceberg/blob/a78aa2dbdb98634f26066c457cc1aef93166be9f/site/docs/maintenance.md#L75-L103)
- [`RewriteDataFiles`：partial progress 与提交次数上限](https://github.com/apache/iceberg/blob/a78aa2dbdb98634f26066c457cc1aef93166be9f/api/src/main/java/org/apache/iceberg/actions/RewriteDataFiles.java#L27-L48)
- [`RewriteDataFiles`：file group 大小、并发和 target file size](https://github.com/apache/iceberg/blob/a78aa2dbdb98634f26066c457cc1aef93166be9f/api/src/main/java/org/apache/iceberg/actions/RewriteDataFiles.java#L50-L89)
