---
title: "知识库的新鲜度怎么量：从源变更到回答可见的延迟预算"
date: "2024-03-05 09:58:14"
updated: "2024-03-05 09:58:14"
categories:
- "AI Agent 工程化"
tags:
- "知识新鲜度"
- "SLA"
- "RAG"
description: "把知识新鲜度拆成发现、抓取解析、索引发布和查询可见四段延迟，定义 source event time、watermark、stale policy、SLO 与可验证的新鲜度探针。"
cover: /images/articles/knowledge-freshness-sla.svg
top_img: /images/articles/knowledge-freshness-sla.svg
permalink: /2024/03/05/knowledge-freshness-sla/
comments: false
editorial_standard: expert-v1
---

知识库页面显示“今天更新”，不代表用户现在问问题能检索到今天的内容。源文档变更后，要经过事件发现、抓取、解析、embedding、索引发布、复制与缓存失效。任何一段积压，答案都可能继续引用旧版本。

我把新鲜度定义为 `query-visible time - source event time`，再拆成各阶段延迟预算。没有源事件时间时，只能报告“平台最近一次成功观测”，不能把抓取时间冒充内容真实更新时间。

![知识新鲜度预算拆解](/images/articles/knowledge-freshness-sla.svg)

<!-- more -->

## 先区分四种时间

`source_event_time` 是源系统中内容或权限真正生效的时间；`discovered_at` 是 connector 发现变更；`indexed_at` 是新版本进入检索索引；`served_at` 是线上查询第一次能命中新版本。

只监控 ingestion job duration，看到每次五分钟完成，也可能漏掉事件在队列里等了两小时。只看 indexed_at 又会漏掉 alias 未切、只读副本延迟和 answer cache 仍返回旧内容。

每个版本保存这些时间与时区，duration 用统一 UTC 计算。源系统只给日期没有时刻时，精度标为 day，不拿 00:00:00 计算一个虚假的小时级 SLA。

`observed_at - event_time` 可能为负，通常是时钟漂移或源事件使用业务有效时间。系统要保留原值并标异常，不能简单取绝对值。跨系统时钟误差进入误差预算。

## Watermark 表达“处理到哪里”

最新成功一条事件不能证明之前没有缺口。connector 应维护 source partition/tenant 维度的 watermark：所有小于等于该位置的事件已成功处理或明确隔离。遇到坏文档时，是阻塞 watermark，还是记录 dead-letter 后推进，要由内容风险决定。

高风险权限事件优先且不可跳过。普通文档解析失败可以隔离并推进，同时在 coverage 指标扣分；权限撤销失败则 fail closed，避免新鲜度提高却留下泄露。

全量扫描型源没有事件 offset，可以使用 enumeration snapshot：本轮列出了多少 source IDs、开始/结束时间、与上轮差异。扫描成功但只拿到半页分页数据，不应推进 watermark。分页 token、总数和校验要入 manifest。

查询时将所需知识域的 watermark/freshness 带入 trace。用户问的是财务制度，技术文档源的延迟不影响本次答案；全局一个“知识库延迟”会混淆不同域。

## SLO 要按内容风险分级

不是所有知识都需要分钟级同步。产品介绍一天更新一次可能够用，生产权限撤销应在几分钟内生效，任务运行状态甚至需要秒级。统一把所有内容做实时，会增加复杂度和成本，也无法表达业务优先级。

我为每个 source class 定义 freshness objective 与 stale action：

```text
权限/密级：P99 5 分钟；超时后 fail closed
生产运行状态：P95 1 分钟；显示观测时间，超时拒绝确定结论
制度与配置：P95 30 分钟；标 stale，可回源确认
历史知识：P95 24 小时；允许旧版本服务
```

SLO 统计从 source event 到 served，按版本而不是按任务次数。一天没有变更时不能用“无失败”制造 100% 新鲜度；通过周期性 synthetic updates 或源端 heartbeat 验证链路仍工作。

Google SRE 对 SLI/SLO 的基本原则是从用户可见行为定义指标。知识系统也一样：索引任务绿灯只是内部信号，用户能否看到正确版本才是最终 SLI。

## Cache 是最容易漏掉的一段

向量索引已更新，query/result cache 仍可能返回旧候选；answer cache 更直接保存带旧引用的完整回答。缓存 key 只包含问题文本时，内容版本、权限和时间都无法失效。

缓存条目记录 evidence source/version IDs、policy version 和 index version。源更新或 tombstone 到来，按反向关系失效相关条目。没有反向索引时，给缓存短 TTL 只能降低风险，不能保证权限撤销即时生效。

CDN 与客户端缓存也要考虑。答案 API 返回 ETag 和适当 Cache-Control；敏感/个性化回答默认 private/no-store。页面自己的会话状态不能在索引更新后继续展示“当前答案”而不标生成时间。

served_at 的探针要穿过真实查询和缓存链路。直接查向量数据库看到新 chunk，不代表应用路由、reranker 和 answer cache 已经切换。

## 用合成知识做端到端探针

我会为每个重要知识域维护一个无敏感的 canary source，定期写入唯一 version token。探针从用户入口提问或调用检索，检查新 token 何时可见、旧 token 何时消失，并记录各阶段 trace。

探针同时覆盖 update、delete 和 ACL revoke。只测新增会漏掉 tombstone 与缓存失效。权限探针使用两个测试主体，确认授权用户可见、撤权用户不可见。

告警先定位延迟段：event undiscovered、fetch backlog、parse failure、embedding throttling、index unpublished、replica lag 或 cache stale。所有延迟只报“RAG 更新慢”，值班仍需从头查。

真实内容也抽样对账。根据 source registry 随机取版本，验证 current manifest 和索引一致；从索引反查 source，发现 orphan chunks。合成探针证明链路可走，reconciliation 证明真实数据没有漂移。

## 答案必须携带新鲜度边界

生成上下文中的每个 evidence 都有 source valid/observed/indexed time。最终答案展示关键来源更新时间；若某个核心证据超过 stale threshold，发布策略降低语气、回源或拒答。

不能用整个索引最近更新时间代替单个来源。索引刚写入一篇新闻，不代表三个月没同步的制度也新鲜。claim 的 freshness 由支持它的 evidence 决定。

用户问“现在任务是否运行”，证据是十分钟前快照时，正确回答是“最近一次观测为运行中，时间为…”，不是“正在运行”。时间语义进入自然语言，才不会把延迟系统包装成实时系统。

知识新鲜度不是后台 ETL 的一个 duration，而是从事实变化到用户可见的完整延迟。把阶段时间、watermark、风险分级、缓存和探针建起来，团队才能承诺可验证的 SLA，也知道过期时系统该继续答、标记还是停止。

## 参考规范与资料

- [Google SRE Workbook：Implementing SLOs 与用户可见 SLI](https://sre.google/workbook/implementing-slos/)
- [RFC 3339：互联网时间戳与时区格式](https://www.rfc-editor.org/rfc/rfc3339)
- [Apache Kafka 3.6：Consumer position、committed position 与 offset 语义](https://kafka.apache.org/36/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
- [W3C Trace Context：跨抓取、索引与查询传播关联身份](https://www.w3.org/TR/trace-context/)
