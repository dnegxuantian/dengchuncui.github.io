---
title: "Context Engineering 本质是信息预算：什么必须保留，什么可以丢"
date: "2025-09-06 18:39:33"
updated: "2025-09-06 18:39:33"
categories:
- "AI Agent 工程化"
tags:
- "Context Engineering"
- "上下文压缩"
- "Token 预算"
description: "把模型上下文当成有优先级的信息预算，先预留输出与工具空间，再保护 policy、用户目标、运行状态和核心证据，对历史、示例与辅助材料做可审计选择和压缩。"
cover: /images/articles/context-engineering-budget.svg
top_img: /images/articles/context-engineering-budget.svg
permalink: /2025/09/06/context-engineering-budget/
comments: false
editorial_standard: expert-v1
---

模型上下文窗口变大后，一个直接做法是把更多历史、文档、工具结果和记忆都塞进去。效果未必更好：关键约束埋在中间，重复片段抢占注意力，旧状态与新状态冲突，输出和工具参数又没有剩余空间。

我把 Context Engineering 看成信息预算。先从模型上限中预留输出、工具结果和安全余量，再按 P0/P1/P2 分配输入。压缩的目标不是尽量变短，而是在预算内保住完成任务与验证所需的信息。

![Context 是有优先级的信息预算](/images/articles/context-engineering-budget.svg)

<!-- more -->

## 预算从输出端倒推

上下文上限不能全部给输入。需要生成长报告，就预留输出 tokens；可能调用工具，还要预留 function arguments、tool result 和下一轮控制信息。达到上限后被供应商截断，比主动少放一段辅助材料更危险。

预算按 Run/Step 计算：

```text
input_budget = model_context_limit
             - max_output_reserve
             - tool_round_reserve
             - protocol/safety_margin
```

实际 tokenizer 由目标 model snapshot 决定，不能用字符数粗估生产边界。路由到更小上下文模型时重新构建 context，不直接截尾同一 messages 数组。

预算和使用记录在 manifest。超预算时知道删/压了哪些段，而不是由 SDK 静默截断。

## P0 信息永远不靠相似度选择

P0 包括 system/security policy、真实用户目标、当前授权主体、关键业务约束、Run/Step 状态、已提交副作用和终止条件。它们由结构化 runtime 注入，不进普通向量检索候选。

“工具已成功创建 operation X”不能因对当前问题语义相似度低被丢掉，否则模型可能再次执行。用户限定“只看测试环境”也不能在历史压缩中变成一句模糊摘要。

P0 本身要精简和无冲突。多个 system fragments 有明确优先级和版本；旧 policy 不与新 policy 同时放。状态使用 canonical snapshot 加 event refs，不把全部事件日志塞给模型。

敏感字段尽量以 opaque IDs/capabilities 表达。模型需要知道能否执行，不需要看到 token 和内部策略实现。

## P1 围绕完成与验证选择

P1 是当前 Step 所需 tool schemas、核心 evidence、对象结构、成功标准和错误恢复信息。选择依据是任务分解和 required claims，不只是 query 相似度。

研究任务先列核心 claims，为每条分配 evidence budget，避免一个热门子问题占满上下文。SQL 任务分配 schema/relationships/metric definitions，工具任务保留目标对象/current version/plan。

证据先去重同源转载和相邻重复 chunks，再保留来源、版本、span 与限定条件。不能为了压缩只留下结论句，把“仅测试环境”“截至某日期”删掉。

工具 schema 也按当前 Step 选择。一次只可能读取元数据，就不放十个生产动作工具。description 可压缩，required/enums/风险和结果状态不能丢。

## P2 可以压缩，但要知道损失了什么

长对话历史、few-shot examples、次要证据、调试细节属于 P2。先删除重复与已被结构化 state 吸收的内容，再摘要，最后按相关/新鲜/权威评分裁剪。

对话摘要分 facts、decisions、open questions、user preferences 和 dropped topics，不写一段自由叙事。每项保留原 message refs，出现争议可展开。

工具大结果由确定规则提取：错误码、关键日志窗口、统计和 evidence link。模型摘要可以辅助解释，但不能覆盖 raw artifact。日志截断标 head/tail/range，防止模型以为看到全量。

few-shot 选择与任务类型匹配，避免多个相似示例占预算。安全边界靠 validator/policy，不靠塞几十个反例提醒模型。

## 长上下文不等于所有位置同样有效

论文《Lost in the Middle》在多文档问答和键值检索实验中观察到：相关信息位于长输入中部时，模型表现可能低于信息在开头或结尾的情况。工程上不能因为总 token 未超上限，就认为关键证据一定被使用。

关键 P0 放在稳定显著位置，P1 按任务结构分组，用清晰标签与 IDs；生成前的最终 checklist 可以引用必要 claims，但不要重复整段内容。

上下文顺序是 Bundle 的一部分。A/B 改顺序时固定内容集合，评估工具选择、事实引用和失败率。一次同时增删材料和改顺序，无法归因。

模型是否使用证据通过 claim-evidence trace 验证。某段被放进 context 不等于答案依据了它。

## Compaction 必须保护状态和证据

Agent 长运行需要压缩旧步骤。compactor 输入 event/artifact graph，输出 checkpoint state、已完成 operations、未解决问题、关键 facts/evidence 和 budgets，不从聊天文本简单总结。

已提交副作用永不只保留自然语言。保存 operation ID/status/idempotency 和 verification。等待确认保存 plan hash/expiry。工具失败保存 error code/retry state，不只留“上一步失败”。

facts 保留 provenance/version，冲突不合并成单值。用户更正旧信息时，最新有效版本进入摘要，旧值留引用但不再作为 current。

压缩后用不变量校验：所有 pending obligations、active operations、user constraints、required evidence 是否仍存在。失败则提高预算或暂停，不能产出一个看似流畅但不可恢复的上下文。

## Context Manifest 让选择可回放

每次模型调用保存候选 items、selected/dropped/summarized、token counts、priority、selection reason、source versions 与 builder version。正文可加密，结构与 hash 保留。

回答错误时检查关键证据是未候选、被裁剪、被摘要丢条件，还是已在上下文但模型没使用。四种问题分别修 retrieval、budget policy、compactor 或 model/Prompt。

指标不只看 token utilization。还看 required evidence coverage、duplicate ratio、stale/conflict items、tool schema coverage、compaction invariant failures、cost per verified success。

Context Engineering 不是把更多信息塞进模型，而是让每个 token 有明确职责。预算倒推、优先级、结构化压缩和 manifest 建好后，窗口再大也不会把系统状态与证据淹没在历史里。

## 参考论文与资料

- [Lost in the Middle：长上下文中信息位置对使用效果的影响](https://arxiv.org/abs/2307.03172)
- [Retrieval-Augmented Generation：检索证据进入生成上下文](https://arxiv.org/abs/2005.11401)
- [MemGPT：分层记忆与上下文管理](https://arxiv.org/abs/2310.08560)
- [KILT：答案与 provenance 的联合评测](https://arxiv.org/abs/2009.02252)
