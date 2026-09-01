---
title: "Agent 评测集从哪里来：先把每次生产失败变成可回放用例"
date: "2024-08-18 16:29:51"
updated: "2024-08-18 16:29:51"
categories:
- "AI Agent 工程化"
tags:
- "Agent 评测"
- "回归测试"
- "故障复盘"
description: "把生产 Agent 失败按上下文、模型、工具、策略和运行时归因，抽取成脱敏、固定环境、带不变量断言的回放用例，并用守门集控制发布。"
cover: /images/articles/agent-eval-from-failures.svg
top_img: /images/articles/agent-eval-from-failures.svg
permalink: /2024/08/18/agent-eval-from-failures/
comments: false
editorial_standard: expert-v1
---

Agent 评测最容易从“先造 100 道题”开始。题目通常干净、步骤短、工具永远成功，最后测出一个不错的完成率。生产失败却来自另一套分布：权限刚变化、工具 200 但 body 缺字段、流中途断开、两个同名对象、旧 memory 污染了本轮。

我更愿意从真实失败反向建设评测。每个对用户有影响的 Run，先完成证据归因，再抽成最小可复现场景，脱敏审核后加入固定版本的 regression suite。评测集不是一次性题库，而是系统故障经验的可执行资产。

![从生产失败生成可回放评测](/images/articles/agent-eval-from-failures.svg)

<!-- more -->

## 先确认失败发生在哪一层

用户说“Agent 没把任务重跑成功”，可能是五类问题：上下文选错实例，模型选错工具/参数，工具适配器丢字段，权限策略拒绝，或任务已执行但流式最终结果丢了。

trace 要包含输入、检索、模型 attempts、工具 proposal、policy、operation、raw/normalized events 和 finalization。归因从可验证事实开始：后端是否产生 operation ID，资源状态是否变化，模型是否收到完整结果。

一个 Run 可以有主因与放大因素。模型参数错是主因，错误码不稳定导致无限重试是放大；工具已成功、最终消息断流，主因是 runtime/protocol，不应加入“模型不会调用工具”的评测桶。

无法归因时标 unknown，并补观测。硬选一个团队背锅，会把错误样本放进错误评测，后续修复反而污染系统。

## 抽取最小场景，不复制全部生产会话

生产 trace 可能很长且含敏感数据。评测用例保留触发失败所需的最小输入、权限上下文、对象状态、工具响应和关键历史。删除无关消息后重新运行，若失败不再出现，说明删掉的内容可能是条件，要逐步加回。

环境依赖用 fixture/mocks 固定：Catalog 返回两个同名任务，工具第一次 timeout 但实际已执行，SSE 在 finish 前断开，policy version 拒绝跨项目。mock 响应来自去敏真实形态，包含原协议边界，不只写一个理想 JSON。

断言描述不变量，不强求逐字输出。例如必须选择用户明确的 `prod/job_17`、不得重复执行 operation、最终状态不得 success、答案必须引用 error evidence。自然语言可以变化，安全和业务结果不能。

模型具有随机性，单次通过不足。按风险设重复次数和通过门槛；权限越权用例要求零违规，普通措辞问题允许统计比较。temperature、model snapshot、Bundle 与工具版本都固定。

## 脱敏后仍要保留工程结构

把所有名称替换成 `foo/bar`，可能破坏同名歧义、语言和长度特征。脱敏使用一致映射：同一个真实对象在所有事件里变成同一个测试 ID，不同环境和层级关系仍保留。

敏感文本可改写成结构相同的合成内容，但保存哪些特征必须保留：Prompt Injection 位置、错误码格式、JSON 分片、超长字段、权限标签。评测 owner 审核没有凭据、个人信息和商业内容后才入库。

每个 case 记录 source incident/run ref、failure category、risk、owner、created_at、dataset version 和 expected behavior。真实 trace 的访问受限，普通评测只使用脱敏 fixture。

用户删除数据时，评测集也要追踪派生关系。若用例无法在合规基础上继续保留，就删除或重新合成，不能因为已脱敏就默认永久保存。

## 回归集分能力与守门

能力集衡量任务完成、答案正确、引用、成本和延迟；守门集覆盖权限、重复副作用、Prompt Injection、错误终态、敏感输出与不可逆动作。发布先过守门，再比较能力收益。

失败按矩阵分桶：context/retrieval、model decision/output、tool/protocol、policy/auth、runtime/state、final answer。每次改动展示修复了哪些 case、新增了哪些失败，不只给一个平均分。

重要但低频的生产事故单独加权。若一万条摘要题盖过一次生产误删，平均分没有风险意义。高风险用例使用绝对门槛，不允许被其他提升抵消。

数据集版本不可变。新增/修正标注发布新版本，历史发布报告继续引用旧 hash。评测代码与 judge model 也版本化，避免“同一分数”实际由不同评审标准产生。

## 修复需要验证因果

一条工具参数失败后，在 Prompt 里加完整正确答案，当然能让该用例通过，却可能是记忆题。修复前写假设：schema 描述不清、对象解析缺失、模型选择错或 validator 太宽。一次只改变对应变量，在相邻/变体用例上验证泛化。

对照实验固定其余 Bundle。改 Prompt 时固定 model、tools、index；改 adapter 时用固定 raw events；改 policy 时用固定 proposal/resource state。端到端再验证组合效果。

通过离线集后影子/灰度，观察真实失败桶、人工接管、工具调用数、成本和延迟。测试集无法覆盖所有分布，生产守门指标仍是发布条件。

修复上线后关闭 incident 的标准不是“这次能跑”，而是原始/脱敏 case 稳定通过、没有新增高风险回归、线上同类错误下降。证据链才算闭环。

## 评测基础设施也要防自欺

模型评审器可能偏好长答案、与自己风格相似的输出，或用自身知识补足缺失证据。关键事实使用确定性断言，引用验证对照 source spans，高风险结论人工抽查。LLM judge 只承担难以规则化的部分，并记录理由与版本。

测试工具不能总返回成功。准备 timeout、429、200-malformed、迟到回调、状态冲突、部分结果和不可重试错误。Agent 的可靠性主要在失败路径里体现。

结果报告展示样本量和置信区间。一个新任务桶只有五条样本，不能根据 100% 通过就全量路由。线上收集更多真实 Run 后再更新权重。

OpenAI Evals 提供了用测试样本评估模型行为的框架，NIST AI RMF 强调测量与持续管理风险。对企业 Agent，最有价值的样本来源就是自身运行失败：它包含真实工具、权限和状态边界，也是团队已经付过代价的经验。

把生产失败变成回放用例后，每次事故不只留下一篇复盘文档，还会变成以后发布必须跨过的门槛。评测才从展示模型能力，转向保护系统不重复犯同一种错。

## 对照框架与资料

- [OpenAI Evals：用样本与 grader 评估模型输出](https://github.com/openai/evals)
- [NIST AI Risk Management Framework 1.0](https://www.nist.gov/itl/ai-risk-management-framework)
- [W3C Trace Context：关联生产 Run 的跨服务证据](https://www.w3.org/TR/trace-context/)
- [JSON Schema 2020-12 Validation：结构化输入输出断言基础](https://json-schema.org/draft/2020-12/json-schema-validation)
