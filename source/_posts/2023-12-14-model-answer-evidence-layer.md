---
title: "模型答案为什么要多一层 Evidence：有引用不等于结论被支持"
date: "2023-12-14 16:40:53"
updated: "2023-12-14 16:40:53"
categories:
- "AI Agent 工程化"
tags:
- "证据链"
- "RAG"
- "可信回答"
description: "把模型答案拆成可核查 Claim，并与具体来源版本和 span 建立 supports、contradicts、insufficient 关系，用发布策略阻止伪引用、冲突和证据不足。"
cover: /images/articles/model-answer-evidence-layer.svg
top_img: /images/articles/model-answer-evidence-layer.svg
permalink: /2023/12/14/model-answer-evidence-layer/
comments: false
editorial_standard: expert-v1
---

RAG 产品加上“参考资料”区域后，答案看起来会可信很多。实际抽查时经常发现：链接确实相关，却没有支持模型写出的数字；文档说的是测试环境，答案扩展到了生产；三条引用里两条互相冲突，模型选了表达最顺的一条。

引用是展示形式，证据关系才是可验证结构。我会在最终答案前增加 Evidence 层：先拆出可核查 claim，再把每个 claim 与具体 source/version/span 对齐，标注支持、冲突或不足，最后由发布策略决定保留、降级措辞或拒答。

![答案层之外增加 Claim-Evidence 层](/images/articles/model-answer-evidence-layer.svg)

<!-- more -->

## 先定义哪些句子是 Claim

不是每个连接词都需要引用。对象身份、数值、日期、规则、状态、因果和操作建议属于需要核查的 claim；“下面给出三点”这类组织语言不用。

一段答案可能包含多个 claim：“订单表由交易团队负责，每天 2 点更新，失败会自动重试 3 次。”owner、schedule 和 retry 分别来自不同元数据。只在段尾放一个链接，会让读者误以为同一来源支持全部结论。

我让生成模型先输出结构化草稿，或在生成后用 parser 拆 claim：

```json
{
  "claim_id": "c2",
  "subject": "job_123",
  "predicate": "retry_limit",
  "value": 3,
  "qualifiers": {"environment": "prod"}
}
```

结构不是为了把所有语言变成知识图谱，而是抓住可比较的事实。最终自然语言仍可灵活，但关键值、对象与限定条件不能在润色时变化。

## Evidence 必须定位到版本与 Span

证据引用 source ID、document/entity version、section/span、有效时间和访问策略。只保存 URL 不够，网页或文档更新后，同一链接内容已经变化；只保存 chunk ID 也不够，重新切块会让 ID 失效。

span 可以用字符位置、结构路径和内容 hash 组合定位。答案页面展示标题与片段，点击回源时重新鉴权。审计保留当时证据快照或合规范围内的 hash，避免以后无法解释。

KILT 把知识密集型任务的答案与 provenance 一起评估，这个思路适合企业 RAG：答案正确但来源错，仍是失败。内部系统还需加版本、权限和有效期，确保“来源存在”与“当时可作为依据”同时成立。

Evidence 只能来自本次实际进入模型上下文或确定性工具结果。事后搜索一条看起来相关的文档贴在答案后面，是伪引用。trace 中要能证明哪个 span 在哪个步骤被提供给模型。

## 支持关系需要逐项检查

文本相似度不能直接判定 supports。证据写“最大并发默认 20”，claim 写“所有任务最大并发不能超过 20”，多了“所有”和“不能超过”，语义已经变成硬上限。

对结构化元数据，优先做确定性对齐：subject ID、predicate、value、unit、environment 和 valid time 一致。对文档文本，可用规则与模型评审组合，但评审输出必须引用具体 span，并允许 `insufficient`，不能强制二选一。

数值要检查单位和聚合。`30 days` 不能只因出现 30 就支持“30 次”；报表总量不能支持某个部门的细分值。时间也要检查，历史制度不支持当前状态，除非 claim 明确说的是历史。

支持不等于完整。证据可能支持主结论，却缺适用条件。claim 的 qualifiers 与证据范围逐项比较，缺项就标 partial/insufficient，发布时把限定补回或降低确定性。

## 冲突由规则处理，不让模型投票

同一 claim 可能有多个 evidence。正式制度与群聊记录冲突，新旧版本冲突，Catalog owner 与组织系统冲突。相似度、出现次数或上下文顺序都不是权威规则。

证据源注册 authority level、owner、validity 和 conflict policy。例如当前认证指标定义高于未认证 Wiki；组织系统是 owner 的权威源；两个同级正式制度冲突则不自动回答，生成治理告警。

模型可以把冲突解释给用户：“制度 v2 写 30 天，运维手册仍写 7 天，当前无法确认。”它不能悄悄选一个，也不能把两个数字平均。冲突本身是需要被保留的事实。

过期来源不是立即删除。历史问答可能需要旧证据，但当前问题默认过滤无效版本。query time intent、source valid time 与 claim time 三者要对齐。

## 发布策略决定答案能说到什么程度

每个 claim 得到 `supported`、`partial`、`contradicted`、`insufficient`。低风险说明类问题可以删除 unsupported 句子后返回；关键指标、生产操作和权限类问题只要核心 claim 不被支持，就拒答或转人工。

策略可以把确定语气降级：“当前索引中只找到测试环境配置，生产值无法确认。”这不是简单让模型“更谨慎”，而是根据 evidence status 生成固定边界。

最终 UI 把引用放在对应 claim 旁，展示来源名称、版本和更新时间。一个段落多个来源时，用户不用在页脚猜哪个链接支持哪句话。机器接口同时返回 claim/evidence IDs，方便下游系统继续验证。

回答保存 finalization report：删除了哪些 unsupported claims、发现哪些冲突、用了哪个 policy version。只保存最终文本，会看不到系统实际上挡住了多少风险。

## 评测围绕 Claim-Evidence 对

评测样本标注 expected claims、supporting spans、forbidden claims 和冲突处理。指标包括 claim precision/recall、evidence precision/recall、citation support rate、unsupported claim rate 和正确拒答率。

长答案不能因为多数普通句子正确，就掩盖一个错误关键数字。claim 按风险加权，生产操作建议、权限和财务数字权重更高。unsupported high-risk claim 是守门失败，不参与平均稀释。

线上用户点“引用不支持”时，直接落到 claim/evidence pair。人工修复可能更新知识源、调整 chunk、修改对齐器或改变发布策略，不再把所有问题扔给 Prompt 团队。

Evidence 层会增加一点延迟和实现成本，但它把“看起来有来源”变成“结论与来源有可检查关系”。在数据平台和企业 Agent 场景里，这层结构决定答案能否进入真实决策，而不仅是用于聊天参考。

## 参考论文与资料

- [KILT：答案与知识来源 provenance 的联合基准](https://arxiv.org/abs/2009.02252)
- [Retrieval-Augmented Generation：外部检索证据进入生成上下文](https://arxiv.org/abs/2005.11401)
- [FEVER：对文本 claim 做 evidence retrieval 与 verification](https://arxiv.org/abs/1803.05355)
- [BEIR：跨领域检索的统一评测框架](https://arxiv.org/abs/2104.08663)
