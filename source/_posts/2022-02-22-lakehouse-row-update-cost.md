---
title: "湖仓表的 UPDATE 为什么比数据库贵：Data File、Delete File 与重写放大"
date: "2022-02-22 09:42:38"
updated: "2022-02-22 09:42:38"
categories:
- "湖仓架构"
tags:
- "Apache Iceberg"
- "行级更新"
- "湖仓表"
description: "结合 Apache Iceberg 0.13.0 的格式规范和行级操作源码，拆解湖仓 UPDATE 的 Copy-on-Write、Merge-on-Read、Delete File 以及读写放大。"
cover: /images/articles/lakehouse-row-update-cost.svg
top_img: /images/articles/lakehouse-row-update-cost.svg
permalink: /2022/02/22/lakehouse-row-update-cost/
comments: false
editorial_standard: expert-v1
---

在数据库里执行一条 `UPDATE orders SET status='PAID' WHERE id=...`，我们很容易把它想成“找到这一行，改掉几个字段”。把同样的语句放到湖仓表上，这个直觉会出问题。Parquet 数据文件是不可变的，Iceberg 管的是文件和元数据，不会钻进一个已经提交的 Parquet 文件里原地改几个字节。

于是，更新一行到底有多贵，不能只看 affected rows。它可能触发整个数据文件重写，也可能先增加 delete file，把合并成本推迟到查询和维护阶段。真正要算的是：命中了多少 data file、每个文件多大、产生多少 delete、读端要合并多少层，以及这些文件何时能被重新整理掉。

![湖仓行级 UPDATE 的两条执行路径](/images/articles/lakehouse-row-update-cost.svg)

<!-- more -->

## Iceberg 没有在 Parquet 里原地改一行

Iceberg 0.13.0 的格式规范把表状态组织为 snapshot、manifest list、manifest 和 content files。数据文件一旦写入就不再修改，新的表状态通过一次 snapshot commit 生效。行级更新因此只能表达为文件集合的变化。

最直接的办法是 Copy-on-Write。假设一条 512 MB 的 Parquet 文件有一百万行，这次 `UPDATE` 只命中一行，执行引擎仍要读取原文件，把未变化的 999999 行与新值重新写进一个或多个文件，然后在新 snapshot 里移除旧文件、增加新文件。业务上只变了一行，物理上可能读写了接近 1 GB。

这也是我看湖仓更新成本时先问“命中了几个文件”，而不是先问“改了几行”的原因。如果更新条件无法靠 partition、列统计或文件级索引裁剪，定位一行之前还要扫描大量 manifest 和 data file，扫描放大与重写放大会叠在一起。

Copy-on-Write 的好处很明确：提交完成后，reader 只读整理好的 data file，不需要在查询时额外应用 delete。它适合更新不频繁、读延迟敏感，或者一次更新本来就覆盖较大数据范围的表。它的问题也同样明确：零散更新会产生很高的写放大，还容易和同一批文件上的 compaction、overwrite 相互冲突。

## Merge-on-Read 把成本从写时搬到读时

Iceberg v2 引入 delete file，用来描述不可变 data file 中哪些行已经被逻辑删除。更新可以拆成两个动作：为旧行写 delete，再把新版本作为 data row 插入。`RowLevelOperationMode` 在源码里直接把两种模式写清楚：Copy-on-Write 当场替换命中的数据文件；Merge-on-Read 写 delete file 与新 data file，查询时再应用 delete。

Position Delete 保存 data file 路径和行位置，意思是“这个文件的第 N 行无效”。它定位准确，读端无需拿业务键和每一行比较，但它依赖原 data file 的身份和位置。如果维护任务重写了被引用文件，旧 position delete 也要一起处理，否则它指向的物理位置已经不存在。

Equality Delete 保存用于等值匹配的字段，例如主键 `order_id`。它不绑定某个文件位置，对 CDC 这类按业务键传播变更更自然；代价是 planner 必须找出它可能作用的数据文件，reader 还要按 equality field 合并。字段选择不当、键分布太散或统计信息不足，会让一个很小的 delete file 影响一大片扫描范围。

Merge-on-Read 的写入通常更快，因为更新一行不必马上重写 512 MB 文件。但成本没有消失，只是换了付款时间：scan task 会同时携带 data file 与需要应用的 delete files；查询要读取、匹配并过滤；delete 文件越碎，规划和打开文件的开销越高；后台最终还得把 delete 物化进新的 data file。

## 先算四类放大，再决定模式

我会把一类更新负载拆成四个数字，而不是笼统讨论哪种模式“性能更好”。

第一是扫描放大。条件命中 10 行，但为了找到它们读了多少 manifest、多少文件 footer、多少数据列？如果业务经常按 `tenant_id + order_id` 更新，而表只按日期分区，那么日期分区内的文件布局才是瓶颈。

第二是写放大。Copy-on-Write 的粗略值可以写成：

```text
写放大 = 重写 data file 的总字节数 / 实际变更行的字节数
```

这个值可能非常夸张，但不能脱离最终文件质量看。一次批量更新重写整个目标分区，顺手把小文件合并并恢复排序，未必比积累数万个 delete file 更贵。

第三是读放大。Merge-on-Read 要记录每个 scan task 关联的 delete file 数量、delete 记录数、实际过滤行数和合并耗时。只看 query scanned bytes 会漏掉 delete lookup、hash set、额外 IO 和 CPU。

第四是维护放大。后台 rewrite data files、rewrite position delete files 会再次读取和写入数据，还要提交新 snapshot。维护追不上写入时，表会进入一种看似能写、实际越来越难读的状态。这个欠账应该作为可见指标，而不是等查询变慢再临时跑一次 compaction。

## Sequence Number 决定 Delete 应用到谁

有 delete file 以后，不能简单地把一个分区内所有 delete 应用到所有 data file。Iceberg v2 为 snapshot 和 content file 引入 sequence number，用来判断数据与删除的先后关系。

规范要求，position delete 可以作用于序号小于等于它的 data file；equality delete 作用于序号严格小于它的 data file。这个差异解决了同一次 RowDelta 中插入新行和删除旧行的关系：更新产生的新行不能又被同批 equality delete 误删，而 position delete 可以精确引用同一提交中的已有位置。

`FileScanTask.deletes()` 也说明了读端的真实工作：一个扫描任务不是只有 data file，它还携带要对该文件应用的 delete file 列表。平台做查询诊断时，如果只展示主 data file 数和字节数，用户会看到“只扫了两个文件却很慢”，却看不到背后挂了几十个 delete files。

序号还影响维护。重写 data file 时，不能让仍然有效的 equality delete 因为新文件序号变化而失效，也不能保留已经物化的 position delete 重复过滤。Iceberg 的 rewrite 与并发校验围绕这些关系工作；自己在目录层拼文件、改 manifest，很容易破坏行级语义。

## 更新任务还要面对并发提交

一次 UPDATE 往往先读表，找到受影响的行和文件，再生成 data/delete files，最后提交。读和提交之间如果有另一笔写入，就必须判断那笔变化是否与本次更新冲突。

`RowDelta` 允许记录读取时的 snapshot，验证 position delete 引用的数据文件仍然存在，并用 conflict detection filter 检查期间新增的 data/delete files。源码特别提醒：UPDATE 与 MERGE 应验证并发新增的 delete files，否则本次操作可能在不知道旧行已变化的情况下提交。

这不是把 `CommitFailedException` 重试几次就能解决的问题。Catalog pointer 冲突可以刷新后重试；业务读集发生冲突时，原先基于旧 snapshot 做出的更新决定已经不成立，应重新执行读取和计算，或者明确失败。平台必须区分“提交抢锁失败”和“行级假设失效”，不然自动重试可能提交一笔语法成功、业务错误的更新。

我会为行级操作留下 base snapshot ID、conflict filter、matched data files、added data/delete files、重写字节数和最终 snapshot ID。没有这些证据，出现重复更新或漏更新时只能回头猜 SQL 当时读到了什么。

## 落地时不要把 Compaction 当清洁工

如果选 Merge-on-Read，我会同时定义 delete debt 的上限：单个 data file 可关联多少 delete files、delete records 与 data records 的比例、读取合并耗时达到什么值触发 rewrite。Compaction 不是定时清理目录，而是在不破坏并发语义的前提下，把逻辑删除物化进新的数据文件。

文件大小也不能只追求一个固定目标。文件越大，点状 Copy-on-Write 的重写成本越高；文件越小，规划、metadata 和对象存储请求的开销越大。更新热点明显的表，可以通过排序、分区演进或写分布，让同一业务键附近的数据更集中，降低更新条件命中的文件数。

最终的选择通常不是整张表永远只用一种模式。稳定历史分区可以用 Copy-on-Write 保持读取简单，近期频繁变更的数据采用 Merge-on-Read，再由维护任务在数据冷却后整理。模式必须跟负载、SLA 和维护能力一起定。

湖仓支持 `UPDATE`，只代表 SQL 层能表达这件事。要把它运行好，还得看到不可变文件下面真实发生的扫描、重写、delete 合并和并发验证。忽略这些物理成本，语法越像数据库，故障反而越难解释。

## 对照源码与文档

- [Iceberg 0.13.0 Spec：v2 用 Delete File 表达不可变文件中的行级删除](https://github.com/apache/iceberg/blob/72237429ba164c054480dcfbdb9fe1c86c04dcda/site/docs/spec.md#L27-L40)
- [Iceberg 0.13.0 Spec：Position Delete 与 Equality Delete 的格式](https://github.com/apache/iceberg/blob/72237429ba164c054480dcfbdb9fe1c86c04dcda/site/docs/spec.md#L685-L734)
- [Iceberg 0.13.0 Spec：Sequence Number 与 Delete File 的应用规则](https://github.com/apache/iceberg/blob/72237429ba164c054480dcfbdb9fe1c86c04dcda/site/docs/spec.md#L539-L561)
- [`RowLevelOperationMode`：Copy-on-Write 与 Merge-on-Read 的成本边界](https://github.com/apache/iceberg/blob/72237429ba164c054480dcfbdb9fe1c86c04dcda/core/src/main/java/org/apache/iceberg/RowLevelOperationMode.java#L24-L41)
- [`FileScanTask.deletes()`：扫描任务携带要应用的 Delete Files](https://github.com/apache/iceberg/blob/72237429ba164c054480dcfbdb9fe1c86c04dcda/api/src/main/java/org/apache/iceberg/FileScanTask.java#L25-L41)
- [`RowDelta`：行级变更的文件提交与并发验证契约](https://github.com/apache/iceberg/blob/72237429ba164c054480dcfbdb9fe1c86c04dcda/api/src/main/java/org/apache/iceberg/RowDelta.java#L24-L161)
