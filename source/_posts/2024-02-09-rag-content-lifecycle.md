---
title: "RAG 内容不是导入一次就结束：更新、删除与权限变更怎么闭环"
date: "2024-02-09 16:13:48"
updated: "2024-02-09 16:13:48"
categories:
- "AI Agent 工程化"
tags:
- "RAG"
- "内容生命周期"
- "索引治理"
description: "把 RAG 内容摄取设计成版本化发布流程，覆盖源事件、快照、解析、校验、索引 alias、tombstone、权限撤销、回放与物理清理。"
cover: /images/articles/rag-content-lifecycle.svg
top_img: /images/articles/rag-content-lifecycle.svg
permalink: /2024/02/09/rag-content-lifecycle/
comments: false
editorial_standard: expert-v1
---

很多知识库上线时只做了导入：抓文档、切块、算向量。过几个月后，同一制度的新旧版本一起命中，已离职人员的私有文档仍能被检索，源文件删除了，向量库里还留着片段。问题不在 RAG 算法，而在内容从来没有生命周期。

我把摄取当成一条可发布的数据管道。源系统的 create、update、delete、ACL change 都变成有版本的事件；新索引先在 staging 校验，再切换 current alias；删除和撤权先用 tombstone 立即阻断查询，物理清理由后台完成。

![RAG 内容从源版本到索引发布](/images/articles/rag-content-lifecycle.svg)

<!-- more -->

## Source ID 和 Source Version 是起点

文件路径或 URL 会改，不适合作稳定身份。每个内容源需要 `source_id`，每次变化生成单调 version 或不可变 revision。抓取结果保存 observed_at、content hash、ACL hash、mime type 和 fetch status。

同一版本事件可能重复到达，按 `source_id + source_version` 幂等；事件乱序时只推进到更高版本，但旧版本仍进入历史审计。若源系统没有版本，就组合 ETag、Last-Modified 和内容 hash，同时标注版本可靠性较低。

抓取成功与内容存在要区分。HTTP 404 可能是真删除，也可能权限令牌过期；接口 200 返回登录页也不代表文档内容。connector 校验 content type、结构和最小大小，认证失败进入 source error，不把旧知识误删或把登录页索引进去。

源快照与解析产物分开。parser 修复后，可以从同一 source snapshot 重建，不必重新请求源系统；源系统已删除时，也能解释历史索引如何产生。

## Update 不是直接覆盖向量

一份文档修改一个段落，直接 upsert 新 chunks 容易留下旧 chunks。chunk IDs 如果依赖序号，前面插一段会导致后面全部 ID 变化；如果只依赖文本 hash，相同模板段又会碰撞。

我使用 `source_id + source_version + structural_path + chunk_hash` 标识版本内 chunk，并维护 source version 到所有 chunk IDs 的 manifest。新版本构建完成后，manifest 作为一个整体发布，旧版本从 current view 移除。

解析、切块、embedding 分别记录版本。内容没变但 ACL 变了，可以只更新安全 metadata；parser 升级则重建 chunks；embedding 升级建立新 index version。不同原因的变更路径分开，避免每次都全量重算。

发布前检查 chunk 数量突变、空文档、解析错误、表格/代码抽样、ACL 覆盖和 source version 连续性。一份 100 页 PDF 解析成 2 个 chunk，流水线不应自动把它当成功覆盖旧索引。

## Delete 与 Revoke 先阻断再清理

物理删除向量可能很慢，多个关键词/向量/缓存索引也无法瞬间一致。删除或权限撤销到来时，先把 source/chunk IDs 写入在线 deny/tombstone 集，检索阶段强制过滤；随后异步清理各存储并对账。

权限撤销比内容更新优先级高。源系统 ACL change 事件触发安全索引更新，不等下一次全文抓取。若 ACL 同步失败，敏感域 fail closed；普通域可按 policy 使用 last-known-good，但必须有明确最大容忍时间。

缓存也在删除范围。query cache、rerank cache、生成 answer cache 可能已经包含该内容。缓存条目记录 evidence source IDs，tombstone 时按反向索引失效。只删向量库，旧答案仍可能从缓存直接返回。

物理清理完成后核对 vector、keyword、object storage 与 cache 的残留数。删除请求有 operation ID 和审计结果，不能只在消息队列里“发过一个 delete event”。

## Index 发布要像代码发布

把新 chunks 边生成边写进线上 collection，用户会在几小时内看到新旧混合状态。更稳妥的方式是建立 staging index/version，完成全量或增量构建与验收，再原子切换 alias。

验收包括文档覆盖率、chunk 数量、ACL 分布、embedding 成功率、标注问题 recall 和关键删除不可见。切换后保留旧 index 一段回滚窗口，监控检索和回答守门指标。

增量很大时可以使用 base + delta，但查询必须明确版本视图，不能随机命中尚未完成的片段。compaction 后生成新 base，切换 alias。每个回答记录 index version，用户反馈才能复现。

回滚内容版本与回滚应用版本不同。若新索引泄露权限，先启用 tombstone/fail closed，不能为了恢复检索效果切回同样有权限问题的旧索引。安全变更通常不允许普通回滚。

## 失败状态不能用旧内容假装成功

connector 连续三天抓取失败，旧文档仍在服务时，答案应显示 freshness 降级。Source registry 保存 last_success_version/time、latest_observed_event 和 failure reason。不能只看向量库里“有数据”就认为健康。

解析部分失败也要可见。一个文档 20 个章节，3 个表格失败，manifest 标明 incomplete sections；问题命中这些章节时，系统可以拒答或提示覆盖缺口。流水线总状态 success 会掩盖局部数据丢失。

重试区分暂时故障与确定性坏数据。网络超时指数退避，unsupported format 进入隔离队列等待 parser 支持，权限拒绝通知 owner。无限重试一个加密 PDF，只会堆积队列。

补数据从事件 offset 和 source manifest 恢复，重复执行必须得到同一 current view。摄取任务的 run/attempt、输入版本、产出 manifest 和发布动作都进入审计。

## 生命周期要有 owner 和 SLO

每个 source connector 有技术 owner，每个知识域有内容 owner。前者负责抓取/解析可用，后者负责内容正确、权限与有效期。问答错误才能分别落到平台或业务治理。

指标包括 source coverage、event lag、parse success、index publish lag、tombstone latency、stale sources、orphan chunks 和删除对账成功率。只看向量数量增长，无法说明知识是否健康。

定期 reconciliation 从源 registry、current manifests 和实际索引做三方对账：源已删除但索引存在、manifest 有 chunk 但索引缺失、索引有无归属 chunk 都要修复。事件流保证低延迟，对账保证最终不漂移。

RAG 内容系统的可靠性，取决于能否知道每个片段从哪来、属于哪版、谁能看、何时应消失。把摄取做成可验证发布，知识库才不会随着时间推移变成一个无法解释的向量垃圾场。

## 参考论文与资料

- [Retrieval-Augmented Generation：外部知识作为非参数记忆](https://arxiv.org/abs/2005.11401)
- [Apache Atlas 2.2.0 Hive Hook：实体身份与采集属性](https://github.com/apache/atlas/blob/1a4735939f3ec3ed225f1d12e40653b8eaf610b3/docs/src/documents/Hook/HookHive.md)
- [Apache Iceberg 1.0.0：Snapshot 与原子替换式表更新的 API 模型](https://github.com/apache/iceberg/blob/apache-iceberg-1.0.0/api/src/main/java/org/apache/iceberg/Snapshot.java)
- [W3C Trace Context：跨处理阶段关联一次内容运行](https://www.w3.org/TR/trace-context/)
