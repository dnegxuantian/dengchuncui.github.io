---
title: "RAG 评测为什么要拆开：没召回证据与没用好证据不是一种错"
date: "2023-09-26 11:33:04"
updated: "2023-09-26 11:33:04"
categories:
- "AI Agent 工程化"
tags:
- "RAG 评测"
- "信息检索"
- "可观测性"
description: "结合 DPR、BEIR、KILT 与 RAG 的评测思路，把企业 RAG 拆成检索、固定证据回答和端到端三层，建立可归因的指标、数据集与回归流程。"
cover: /images/articles/retrieval-evaluation-split.svg
top_img: /images/articles/retrieval-evaluation-split.svg
permalink: /2023/09/26/retrieval-evaluation-split/
comments: false
editorial_standard: expert-v1
---

RAG 团队常用一张端到端准确率报表：问题发进去，答案对就记 1，错就记 0。这个数适合看整体趋势，却不能告诉我们该改 embedding、chunking、reranker、Prompt 还是知识源。

我会把评测拆成三层。第一层只测检索是否拿到充分证据；第二层固定正确证据，只测模型能否组织出正确、受引用支持的答案；第三层才跑真实端到端链路，验证两者组合后的延迟、成本和失败分布。

![检索与回答分开评测，失败才能归因](/images/articles/retrieval-evaluation-split.svg)

<!-- more -->

## 数据集不能只有问题和标准答案

一条 RAG 样本至少需要 question、supporting source spans、answer assertions、权限身份、知识时间和不可接受答案。只写一个标准答案字符串，无法判断检索到了哪份证据，也无法容纳多个正确表达。

supporting span 应是最小充分证据。问题有两个条件，就标注能共同支持结论的多个片段；不是把整篇文档都当 gold。允许多个来源时保存 evidence groups，命中任一完整组都算充分，不强迫系统找同一份文档。

答案用事实断言而非逐字比对。例如必须包含数值 30、单位 day、范围 production job，并引用当前制度版本；禁止把测试环境值 7 当结论。这样模型换一种自然表达也能通过，漏掉适用条件仍会失败。

身份和时间不能省。管理员与普通用户的 gold evidence 不同，2022 年制度与当前制度也不同。离线集若不固定 policy snapshot 和 knowledge snapshot，今天重跑找到了更新文档，会被误判为模型进步。

## Retrieval 先测“拿到了什么”

DPR、BEIR 等检索工作常用 recall@k、MRR、nDCG。企业 RAG 可以借这些指标，但 relevance 要从“主题相关”升级到“是否足以支持答案”。

Recall@k 检查 top-k 是否包含所有必要 evidence；MRR 关注首个有效证据位置；nDCG 可以表达多级相关性。除此之外，我会加三项：充分证据率、噪声 token 比、权限违规率。

一段谈同一主题却缺关键限制，只能算 partial relevant。它可能提高传统 recall，却让生成模型更容易给出过度结论。充分证据率直接要求条件和结论齐全。噪声 token 比反映 top-k 中无关/重复内容占用了多少上下文。

权限违规率必须为零。越权 chunk 即使最终答案没引用，也说明检索前过滤失效。不能拿“模型没有说出来”抵消召回泄露。

检索实验固定 query normalization、index snapshot、embedding、filter、top-k 与 reranker 版本。只改一个变量，失败样本按 query understanding、filter、chunk、embedding、rerank、freshness 分类。平均 recall 提升时，关键制度类样本不能退化。

## 固定证据后再测 Answer

第二层绕过检索，直接把标注 evidence 交给模型。此时答错说明问题主要在 Prompt、上下文组织、模型能力或输出验证，不应该去调向量索引。

回答指标包括事实正确性、条件完整性、引用支持度、冲突处理和拒答。引用支持不是“答案里有链接”，而是每个关键 claim 能映射到支持它的 span。模型写了证据没有包含的因果解释，即使结论数字正确，也要标 unsupported claim。

证据冲突样本单独准备。两份制度版本、不同环境或来源等级冲突时，预期行为可能是选择当前认证版本，也可能是显示冲突并请求确认。让评测器只判断最终一句话，会漏掉治理规则。

无答案样本同样重要。提供相关但不充分的片段，验证模型是否拒答并指出缺什么。只有答案题的评测会训练团队一味追求回答率，把诚实的“不确定”当失败。

自动评审可以辅助，但关键样本要用确定断言和人工复核。让另一个模型给所有答案打一个 1 到 5 分，仍可能受表达、顺序和自身知识影响。评审 Prompt、模型和版本也要进入结果记录。

## 端到端层验证组合与运行条件

前两层通过后跑完整链路。这里关注 retrieval 与 generation 的交互：top-k 顺序是否影响引用，邻接扩展是否超 token，权限过滤后证据是否不足，生成是否在流式中完整结束。

端到端指标除了答案质量，还包括检索/首 token/总延迟、input/output tokens、重排成本、拒答率、错误率与每成功答案成本。一个准确率提高 1% 但成本增长 5 倍的配置，是否发布取决于场景价值。

线上 trace 记录候选、分数、过滤、最终上下文、模型输出和引用。用户反馈后能自动归类：gold evidence 不在 top-k 是 retrieval miss；已在上下文但未使用是 answer miss；知识本身错误是 source miss；请求中途断流是 system failure。

这种分类不是为了甩锅，而是让修复落到正确环节。source miss 交给知识 owner，retrieval miss 调索引，answer miss 改 Prompt/模型，system failure 修协议或运行时。

## 数据集要跟着线上失败生长

公开基准能比较通用检索能力，无法覆盖企业表名、制度版本、权限和业务口径。上线初期从搜索日志、人工问答和工单整理小而硬的集合，比造几千个模板问题更有价值。

每个生产错误先保存完整证据，去敏后由 owner 标注正确 source 与 answer assertions，再进入对应 failure bucket。相似问题去重，避免一次热点事故占据整个评测集；高风险问题赋更高权重，但仍展示各桶原始通过率。

数据集版本不可变，新增样本发布新版本。报表同时展示固定基准趋势和最新失败集趋势：前者防止历史回归，后者反映系统是否学会解决新问题。只在不断变化的集合上比较，总分没有可解释性。

测试环境固定 index/knowledge snapshot。若要评估新鲜度同步，建立专门的 temporal test：源文档在 T1 更新，测 T2 索引可见、旧版本不可见和答案切换，而不是把更新混进普通准确率。

## 发布门槛要看错误类型

不是所有指标都可以平均。权限泄露、错误执行建议和伪造引用属于零容忍守门项；普通描述不够简洁可以接受一定波动。发布规则按风险设绝对阈值，再看整体收益。

我会生成一张 failure matrix：行是样本类型，列是 source/retrieval/answer/system。每次 Bundle 变更展示新增失败、已修复失败与未变化失败。评审者能看到“总分 +2”背后是否用三个安全退化换来几十个简单问题提升。

RAG 评测拆层之后，团队不再围着一个准确率猜原因。证据没进上下文就修检索，证据在但答案没用好就修生成，知识本身缺失就回到治理。端到端指标仍重要，但它应该是最后验收，不是唯一诊断工具。

## 参考论文与资料

- [Dense Passage Retrieval：稠密检索与 top-k passage 评测](https://arxiv.org/abs/2004.04906)
- [BEIR：覆盖多类检索任务的异构 benchmark](https://arxiv.org/abs/2104.08663)
- [KILT：知识密集任务、答案与 provenance 的联合评测](https://arxiv.org/abs/2009.02252)
- [Retrieval-Augmented Generation：检索与生成的联合模型](https://arxiv.org/abs/2005.11401)
