---
title: "知识摄取任务显示成功，为什么 RAG 还是缺内容"
date: "2024-05-07 10:46:39"
updated: "2024-05-07 10:46:39"
categories:
- "AI Agent 工程化"
tags:
- "知识摄取"
- "故障诊断"
- "RAG"
description: "用枚举、抓取、解析、切块向量、发布和查询六层证据定位 RAG 内容缺失，重点处理静默截断、分页遗漏、部分成功、ACL 错误与索引对账。"
cover: /images/articles/knowledge-ingestion-failure.svg
top_img: /images/articles/knowledge-ingestion-failure.svg
permalink: /2024/05/07/knowledge-ingestion-failure/
comments: false
editorial_standard: expert-v1
---

知识摄取任务变绿，用户仍搜不到文档，通常不是“向量库偶尔没命中”这么简单。任务成功只说明代码走到了结束，没有证明源内容枚举完整、解析结果没截断、每个 chunk 都生成向量、索引切到了新版本，也没证明查询链路使用了这版索引。

我会沿六层做证据对账：枚举、抓取、解析、切块/embedding、发布、查询。每层都有输入输出不变量和 manifest。定位从第一个数量或版本不一致的层开始，不先调 top-k。

![知识摄取失败的分层定位](/images/articles/knowledge-ingestion-failure.svg)

<!-- more -->

## 枚举层先回答“应该有多少”

不少缺失来自分页。API 默认只返回 100 条，connector 忘了继续取 next token；页码从 0/1 的理解错误漏掉第一页；增量游标推进过早，失败的一页永远跳过。任务没有异常，结果却天然不完整。

每次 enumeration run 保存 source scope、query/filter、page count、item count、next token chain、开始/结束 watermark 和去重统计。源 API 提供 total 时做对账；不提供时，与上次快照和周期性全量扫描比较。

突然从 10 万文档降到 500，不能自动发布为“源系统大量删除”。设置数量变化阈值，进入 quarantine 等待确认。权限 token 失效后 API 可能只返回公开文档，这种静默缩小比明确 401 更危险。

增量与全量互补。事件流提供低延迟，定期 enumeration/reconciliation 找出丢事件、乱序和 connector bug。两者用相同 source ID 体系，差异能落到具体对象。

## 抓取成功要验证拿到的是内容

HTTP 200 可能是登录页、限流提示、空壳 HTML 或权限不足的友好页面。抓取器校验 final URL、content type、title/signature、body size、hash 和 source version，不只看状态码。

附件、嵌入页和动态内容要列 manifest。主页面成功但三个附件失败，source 状态应是 partial，不能用一个 success 覆盖。每个 child resource 有独立 fetch outcome 与重试策略。

重定向和 egress 安全同时检查。目标域在 allowlist，DNS 解析和重定向后的地址仍需验证；不让恶意文档把 connector 引到内网 metadata。内容大小、压缩比和下载时间设上限，防止 zip bomb 与超大文件占满 worker。

抓取失败时保留 last-known-good 还是立即下线，由风险策略决定。权限撤销和明确 delete 立即 tombstone；暂时 5xx 可以短期服务旧版并标 stale。不能把所有失败都解释为删除，也不能永远沿用旧内容。

## Parser 最容易产生“静默成功”

PDF 工具进程 exit code 为 0，但可能只抽到前十页；OCR 失败得到空白文本；表格顺序错乱；字符编码把中文变乱码。parser success 需要内容级断言。

我会记录页数/章节数、抽取字符数、表格/图片/代码块数量、警告、语言分布与每页 hash。源 PDF 100 页、解析页数 12，直接隔离；字符数相对上版下降 80%，也触发人工抽查。

格式专用 parser 失败不能自动退回“提取所有可见字符串”后发布。fallback 结果标低质量，进入单独索引或拒绝用于高风险回答。否则页面看起来有内容，段落顺序和表头已经破坏。

parser/chunker 版本进入产物。修复后用同一 source snapshot 重跑，对比结构 diff，确认增加的是缺失内容，不是随机改变全部 chunk IDs。

## Embedding 批次要逐条对账

调用 embedding API 时，一个 batch 里部分输入超长、超时或返回维度异常，客户端可能只重试整个批次或忽略失败项。最终向量数少于 chunk 数，却仍推进发布。

chunk manifest 为每个 chunk 保存 content hash、token count、embedding status、model/version、dimension 和 vector ID。发布前要求 expected count 与 succeeded + explicitly_excluded 对上，excluded 必须有 reason。

批次重试按 chunk ID 幂等。模型升级后维度变化写入新 index，不能把 1536 与其他维度向量混在同一 collection。embedding 内容清洗/截断策略也版本化；超长 chunk 不能静默截尾，应该回到 chunker 修复。

敏感字段不应因构造 embedding text 被意外加入。进入模型前的 canonical content 与索引 metadata 都可审计，权限标签和 source ID 不依赖模型输出。

## Publish 成功要穿过真实查询

向量写完不等于线上已用。alias 可能仍指旧 index，部分 replica 没同步，关键词索引成功而向量索引失败，query cache 又可能返回旧候选。

发布 manifest 记录各索引版本、document/chunk count、ACL count、alias 前后值和 replica readiness。alias 切换用 compare-and-set，防两个摄取 run 乱序覆盖。新版本失败时旧版继续服务，但 source freshness 显示落后。

端到端 canary 把唯一 token 写入测试文档，确认授权身份能从真实应用召回；更新后新 token 可见、旧 token 消失；撤权身份不能命中。直接查数据库不足以验证路由、过滤、rerank 与缓存。

用户报告某文档缺失时，从 source ID 生成 evidence chain：是否枚举、fetch version、parse manifest、chunk IDs、vector IDs、current index、query filter 与 candidate scores。第一处断点就是调查起点。

## 失败分类决定恢复动作

暂时网络/限流错误可退避重试，确定性格式不支持进入 dead-letter，数据完整性异常阻止发布，权限异常 fail closed，索引部分写入丢弃 staging version。所有错误都无限重试，只会让队列积压并掩盖根因。

恢复后从 manifest 继续，不从头猜。漏掉一个 embedding 重补对应 chunks；parser 修复重建该 source version；alias 错误重新切换但先验证目标 index。每次补偿生成新 attempt，原失败证据不覆盖。

指标按层展示 coverage 与 lag：enumerated sources、fetched versions、parsed complete、embedded chunks、published current、query canary。一个总 success rate 很容易保持 99%，同时稳定漏掉同一批大 PDF。

知识摄取的正确性来自数量、身份、版本和内容不变量，而不是进程退出码。分层 manifest 与真实查询探针建好后，RAG 缺内容就能从“感觉没召回”变成一条可复现、可修复的证据链。

## 参考规范与资料

- [RFC 9110：HTTP status、重定向与内容语义](https://www.rfc-editor.org/rfc/rfc9110)
- [Apache Kafka 3.6 Consumer：position 与 committed position 的区别](https://kafka.apache.org/36/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
- [WHATWG Fetch Standard：重定向与 fetch 处理模型](https://fetch.spec.whatwg.org/)
- [W3C Trace Context：跨摄取阶段关联一次处理](https://www.w3.org/TR/trace-context/)
