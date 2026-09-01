---
title: "Agent Memory 不要只存对话摘要：事实、偏好与运行状态是三种数据"
date: "2025-06-21 13:58:38"
updated: "2025-06-21 13:58:38"
categories:
- "AI Agent 工程化"
tags:
- "Agent Memory"
- "上下文工程"
- "数据模型"
description: "把 Agent Memory 拆成带来源与有效时间的事实、可由用户控制的偏好、可恢复但短生命周期的运行状态，并分别设计写入、冲突、权限、保留和删除。"
cover: /images/articles/agent-memory-three-layers.svg
top_img: /images/articles/agent-memory-three-layers.svg
permalink: /2025/06/21/agent-memory-three-layers/
comments: false
editorial_standard: expert-v1
---

Agent Memory 最常见的实现，是每隔几轮让模型总结对话，把摘要写进向量库。这样很快会混进三类完全不同的数据：用户所在城市这类事实、偏好中文回答这类偏好、任务执行到第三步这类运行状态。它们的正确性、有效期和删除规则并不相同。

我会先拆数据模型，再谈 embedding/召回。事实需要来源和时间，偏好需要用户可见可改，运行状态需要强一致的 checkpoint。三层都可以进入上下文，但不能共用“相似度高就拿出来”的读写规则。

![Agent Memory 的三层数据模型](/images/articles/agent-memory-three-layers.svg)

<!-- more -->

## 事实 Memory 必须有 Provenance

“用户常驻杭州”可能来自用户明确自述、简历文档、IP 推断或一次出差对话。只保存句子，下一次模型会把不同可信度来源都当事实。

事实记录 subject、predicate、value、source/evidence ref、valid_from/to、observed_at、confidence、sensitivity 和 policy version。明确自述与推断分开，推断默认短 TTL，不把一次对话观察永久化。

更新不是覆盖字符串。新事实与旧事实冲突时，按来源权威和有效时间建立新 version；历史询问仍能查旧值。无法裁决则保存 conflict，不让模型挑一个顺口答案。

事实写入要过 gate。模型 proposal 先抽取候选，schema/对象/来源验证后再写；高敏感或影响后续动作的事实需要用户确认。对话里第三方信息不能默认写入用户长期 memory。

## 偏好不是从一次行为永久推断

“请用中文回答”是本轮指令；“以后都用中文”才可能是长期偏好。用户跳过一次图表，也不代表永远不喜欢图表。偏好记录 scope、strength、explicit/observed、evidence count、expiry 和 user visibility。

显式偏好优先、可在设置中查看和删除。观察型偏好需要多次一致行为才提升 strength，并设衰减。系统不能把敏感属性、情绪或职业推断包装成个性化偏好。

偏好有层级：全局、workspace、task type、session。技术文章口吻偏好不一定适用于给家人写祝福。Context Builder 按当前 scope 选最具体且有效的值，冲突时尊重显式用户指令。

偏好只改变表现和可选策略，不能扩大权限。用户喜欢“少确认”不能绕过高风险 action 的 approval policy；喜欢简洁也不能省掉关键限制和风险披露。

## 运行状态需要事务和状态机

Agent 正在等待工具 operation、用户确认或子任务结果，这不是向量检索意义的记忆，而是 Workflow state。它必须用 run/step/attempt、state version、operation IDs、pending events、deadline 和 checkpoint artifacts 表达。

恢复依赖 compare-and-set 与幂等。进程重启后读取 current state，查询已有 operation，不从“我们刚才已经重跑任务”这句摘要判断。模型说已完成不等于后端 operation success。

运行状态生命周期短。Run 成功/失败后按审计策略归档，临时 scratch/working memory 过期删除。不能把每一步工具结果永久塞进个人长期记忆，既增加噪声也扩大敏感数据保留。

跨 Run 需要复用的产物转成事实/知识时，经过单独 promotion gate。例如“job_17 当前 owner=A”从工具结果抽取为有来源、有效期的事实；原 Run state 不直接成为长期上下文。

## Context Builder 负责读，不让模型全库搜索

每次 Run 根据任务、用户、权限、时间和 token budget 选择 memory。事实按 subject/predicate/time 与检索相关度，偏好按 scope/strength，运行状态按当前 run ID 精确读取。

模型不获得任意 `search_all_memory`。工具接口按 memory type 和 scope 收窄，先做 ACL，再检索。高敏感 facts 只有明确任务需要和 purpose 才进入上下文。

检索结果带 memory ID/version/provenance/trust label。生成答案时可引用事实来源；observed preference 以软提示呈现，不写成“用户明确要求”；stale fact 标时间或回源验证。

上下文快照 hash 写入 Run。同一 attempt 重试默认复用，避免 memory 在中途更新导致行为漂移；新 Step 需要刷新时记录 diff。

## 写入、合并与删除是核心能力

写入事件记录谁提出、谁验证、用什么来源和 policy。模型自动抽取只产生 candidate；用户/规则/工具决定 commit。重复 facts 用 canonical key 与 source version 幂等。

合并不能只让模型写新摘要覆盖旧摘要。结构化 facts/preferences 分项合并，摘要是派生 view，可重建。内容来源删除后，沿 provenance 找到派生 facts、embeddings 和缓存，按策略 tombstone 或重算。

用户“忘记这个偏好”产生 deletion/tombstone，立即从 Context Builder 过滤，再异步物理清理。运行审计可能依法保留最小事件，但不继续用于个性化，二者目的分开。

Memory store 支持导出：用户能看到系统记住了哪些显式偏好和事实、从哪来、何时更新。不可见的“隐性画像库”既难纠错，也容易积累合规风险。

## 评测按三层分别设计

事实层测 provenance、时间选择、冲突、拒答和删除；偏好层测 scope、显式覆盖、衰减与不越过安全策略；运行状态测 crash recovery、重复事件、operation 幂等和 checkpoint。

端到端再测 Context Builder 是否选到必要 memory、没有越权/过期内容、token 成本与答案效果。只测“记得用户名字”，看不出系统是否会把错误事实永久化。

指标包括 candidate/committed ratio、user corrections、stale/conflict facts、observed preference promotion、memory retrieval usefulness、deleted residuals 和 state recovery success。Memory 越多不是越好，无用和错误记忆应下降。

MemGPT 等工作把分层记忆与上下文管理带入 Agent 讨论，Generative Agents 也展示了经验记录、反思与检索。企业实现还要补上数据治理：来源、时间、权限、状态一致性和用户控制。

Memory 的核心不是让模型“永远记住”，而是让正确的数据在正确范围、正确时间进入上下文。先把事实、偏好与运行状态分开，后面的索引、压缩和召回才有可靠基础。

## 参考论文与规范

- [MemGPT：用分层记忆管理扩展 LLM 上下文](https://arxiv.org/abs/2310.08560)
- [Generative Agents：观察、记忆、反思与规划](https://arxiv.org/abs/2304.03442)
- [W3C PROV-O：Entity、Activity、Agent 的 provenance 模型](https://www.w3.org/TR/prov-o/)
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)
