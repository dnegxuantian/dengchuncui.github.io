---
title: "Deep Research 的难点不是搜得多，而是证据什么时候算收敛"
date: "2025-02-24 09:30:40"
updated: "2025-02-24 09:30:40"
categories:
- "AI Agent 工程化"
tags:
- "Deep Research"
- "证据收敛"
- "研究 Agent"
description: "把 Deep Research 拆成问题边界、可核查 Claim、搜索计划、证据账本、冲突处理和停止条件，避免用来源数量或篇幅冒充研究完成。"
cover: /images/articles/deep-research-evidence-convergence.svg
top_img: /images/articles/deep-research-evidence-convergence.svg
permalink: /2025/02/24/deep-research-evidence-convergence/
comments: false
editorial_standard: expert-v1
---

OpenAI 2 月 2 日发布 deep research 后，长时间自主搜索和综合大量来源的研究 Agent 进入产品视野。连续搜索几十次只是执行表象，真正困难的是回答两个问题：核心结论是否已有足够证据，继续搜索是否还会改变结论。

我把研究过程组织成 Claim-Evidence Ledger。先把研究问题拆成可核查主张和所需证据类型，每轮搜索填补覆盖缺口、查找反例或验证来源；达到预先定义的收敛条件才结束，不以网页数、token 或运行时长作为完成标准。

![Deep Research 的证据收敛循环](/images/articles/deep-research-evidence-convergence.svg)

<!-- more -->

## 研究开始前先冻结边界

“分析湖仓趋势”没有可结束的边界。需要定义时间范围、地区/行业、术语、比较维度、可接受来源、交付深度和截止时间。范围不清时先向用户确认，而不是用搜索结果反向猜问题。

问题拆成主 claims 与子 claims。例如比较两种架构，不只列优缺点，还需要成本、性能、生态成熟度、运维约束和适用场景。每个 claim 标风险和所需来源：官方规格、源码、论文、财报、统计数据或一手访谈。

事实、分析和建议分开。事实要求来源直接支持；分析可以由多条事实推导，但保留推理链；建议还要绑定用户约束。把三者混在一段流畅文本里，读者无法知道哪部分是材料、哪部分是 Agent 判断。

研究计划是可修改 artifact。新证据发现术语有歧义，可以扩展问题树，但每次 scope change 记录原因和预算影响，不能无限长出新分支。

## Search Ledger 防止重复浏览

每次查询记录 query、intent、source filters、结果 IDs、选择/丢弃原因和时间。不同措辞反复搜到同一批页面时，系统知道边际收益已经下降，而不是继续消耗。

来源按权威性与独立性分类。四篇转载同一新闻稿不是四个独立证据；两个 benchmark 若共享数据集和作者，也不能完全当独立验证。provenance graph 把引用/转载关系连起来。

时间敏感结论优先找最新一手来源，同时保留历史版本。网页当前内容可能更新，证据保存 URL、标题、发布日期、抓取时间、内容 hash 和具体 span。无法保存快照时标可复现性限制。

搜索结果摘要不能直接成为证据。必须打开来源，定位支持/反驳 claim 的原文/数据；搜索引擎 snippet 截断且可能过期，只用于候选发现。

## 每条 Claim 都有证据状态

Ledger 对 claim 记录 supports、contradicts、partial、uncertain。证据带来源等级、独立性、时间、适用范围和提取者。一个 claim 可以被两条证据支持，同时被一条高权威来源反驳。

数值核对单位、分母、样本与统计时间。两个来源写“增长 20%”，一个是环比、一个是同比，不能合并。表格/图表中的数字保留行列头和计算公式，不只摘最终值。

二手来源可用于发现线索，核心 claim 尽量回到原始论文、官方文档或数据集。无法找到一手材料时，报告明确说“依据二手报道”，降低确信度。

Agent 生成的推断也进入 ledger，但 evidence type 标 inference，并列出 premises。用户能区分“来源明确写了”与“根据 A/B 推断”。

## 冲突不是噪声，是研究结果

多来源研究必然遇到冲突。不能让模型按多数投票或选择最顺的叙事。先检查定义、时间、样本、环境和版本是否可比，很多冲突其实是范围不同。

真正冲突时比较来源权威、方法透明度、样本和独立性，并在报告展示两边证据。若无法裁决，结论保持 uncertain，说明需要什么新证据才能推进。

反例搜索是固定步骤。初步结论形成后，主动构造反向查询，找失败案例、限制、不同基准和批评。只沿支持方向搜索，会让 Agent 很快“收敛”到最初假设。

来源多样性要看方法与利益相关方，域名数量本身没有意义。官方规格说明设计意图，用户事故说明运行现实，论文 benchmark 说明受控实验，各自回答不同问题。

## 收敛条件要能计算

我会为研究设以下停止条件：所有 high-risk claims 有充分证据；关键 claim 至少有两个独立来源，或一个权威一手来源；冲突已解释或显式保留；最近 N 次搜索没有新增高价值 evidence；预算/deadline 未超。

“两个独立来源”不是硬性真理，某些规格只有唯一官方来源。规则按 evidence requirement 配置。关键是要求在研究前可见，不能写到最后再用现有材料定义“够了”。

边际收益用新增 claim coverage、提升 confidence、发现重要 contradiction 衡量。又找到十篇重复文章，收益接近零；找到一个能推翻核心假设的源码提交，收益很高。

预算到期但未收敛，状态是 incomplete，不把停止包装成完成。报告列未覆盖 claims、冲突和下一步搜索建议。

## 报告必须能从结论回到证据

最终报告的关键句绑定 evidence IDs，引用靠近 claim，显示来源日期与适用范围。参考文献列表很长却无法对应结论，不算可复核。

方法附录记录查询范围、来源过滤、检索截止、排除标准、模型/工具版本与局限。使用 paywall、动态页面或无法复现的数据也说明。

生成后做 claim-evidence verification：引用是否真的支持，数值是否一致，限定条件是否保留，冲突是否被遗漏。高风险结论人工抽查，不能让同一个模型既写又无条件自批。

研究 trace 保存计划变化、搜索 ledger、证据选择与最终 claims。用户指出错误时，能定位是源材料错、提取错、推断错还是过期，不把整份报告重写后失去现场。

Deep Research 的价值不在于产生更长报告，而在于把分散来源组织成一条可以检查的论证链。搜索是手段，证据覆盖、独立验证、冲突处理和清晰停止条件，才决定研究是否真正收敛。

## 对照官方资料与论文

- [OpenAI 2025-02-02：Introducing deep research](https://openai.com/index/introducing-deep-research/)
- [KILT：知识密集任务中答案与 provenance 联合评测](https://arxiv.org/abs/2009.02252)
- [FEVER：Claim、Evidence Retrieval 与 Verification](https://arxiv.org/abs/1803.05355)
- [BEIR：跨领域检索基准与评测](https://arxiv.org/abs/2104.08663)
