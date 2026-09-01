---
title: "多模型路由怎么做：先过能力硬约束，再比较成功率、延迟和成本"
date: "2023-11-04 10:51:27"
updated: "2023-11-04 10:51:27"
categories:
- "AI Agent 工程化"
tags:
- "模型路由"
- "模型网关"
- "成本治理"
description: "结合 FrugalGPT 与模型版本 pin 的实践，设计多模型网关的能力硬过滤、分桶评分、确定性路由、受控 fallback 和真实结果反馈闭环。"
cover: /images/articles/multi-model-capability-routing.svg
top_img: /images/articles/multi-model-capability-routing.svg
permalink: /2023/11/04/multi-model-capability-routing/
comments: false
editorial_standard: expert-v1
---

多接几家模型后，网关很容易加一条“失败就切下一个”的逻辑。它能缓解单供应商不可用，却不是完整路由：备用模型可能不支持 function calling、上下文不够、数据地域不合规，或者虽然 HTTP 成功，业务输出已经无法使用。

我把路由分成两步。先用硬约束过滤出“有资格执行”的模型，再在候选中按具体任务的成功率、延迟和成本选择。fallback 也必须重新通过硬约束，不能为了可用性把安全与能力要求降掉。

![多模型路由从请求约束出发](/images/articles/multi-model-capability-routing.svg)

<!-- more -->

## 请求先声明不可妥协的约束

业务调用不只传一个 model alias，还应声明 capability requirements：是否需要 tools/stream、最小 context、输入模态、结构化输出、数据所在区域、允许供应商、最大延迟和预算。

路由注册表按 provider + model snapshot 保存能力和状态。模型名里带 GPT、Chat 或 32k 不能作为推断依据；能力来自官方说明和探测。OpenAI 在 2023 年 6 月为特定 `0613` snapshot 引入 Function Calling，也说明通用别名会升级。网关需要记录固定版本是否支持工具，而不是把同一家所有模型视为等价。

硬过滤包括：功能支持、上下文容量、数据政策、区域、租户合同、健康度和版本状态。没有候选时返回 `NO_CAPABLE_MODEL` 并列出不含敏感信息的原因。悄悄截断上下文、删 tools 或跨区域发送，只会把明确失败变成隐蔽错误。

预算通常分软硬两类。单请求最大费用是硬约束；月度预算接近上限时，可以提高成本权重，但不能自动切到没有通过质量门槛的便宜模型。

## 评分必须按任务桶建立

不存在一个模型在所有任务上都“最好”。摘要、代码解释、SQL 生成、工具选择、长文检索问答的质量和失败形态不同。全站用一个平均胜率做路由，会让高频简单问题淹没低频关键任务。

我按 task_type、语言、长度区间、是否有工具、风险等级建桶。每个 model snapshot 在桶内保存离线成功率、线上验证成功率、p50/p95 latency、token cost、协议错误率和样本量。

评分不是只算一个静态公式。先设质量下限，再在达标候选中优化成本/延迟。例如工具调用必须 schema-valid 与 policy-safe 达到阈值，之后才比较价格；不能用低一半成本抵消参数错误翻倍。

样本少时使用保守先验，避免新模型凭三次成功就拿走全部流量。先做影子评测和小流量探索，按固定用户/会话分配，防止同一 Agent run 中途换模型破坏上下文一致性。

FrugalGPT 提出了用级联与路由组合不同 LLM API，在质量与成本间做选择。工程落地时，关键不是照搬某个优化算法，而是让成功标签来自真实任务验证，而不是另一个模型的泛化评分。

## “成功”要定义到业务结果

HTTP 200、生成了文本、JSON 能解析，只是不同层级的成功。SQL 任务要经过目标引擎验证，工具任务要参数合法且执行结果确认，RAG 答案要有支持引用。路由反馈使用最接近业务的 verified outcome。

一次失败拆成 provider transport、gateway protocol、model output、tool/engine validation、business result。供应商超时可以支持 fallback；模型输出语义错误可能换模型；用户权限拒绝则不该换十个模型重试。

成本统计包含失败与 fallback。主模型生成 90% 后断流，再用备用模型重跑，用户只看到一次答案，平台付了两次费用。只按最终模型计费会让路由器偏好一个经常失败但单价便宜的入口。

反馈有延迟。用户点赞即时，人工审核或任务真正成功可能几分钟后到达。用 request/run ID 关联迟到标签，训练或调权时保留 label source 和时间，不能让粗糙的即时指标覆盖最终验证。

## Fallback 需要明确状态机

什么失败可以自动 fallback，要按错误类型和请求幂等性定义。连接建立前的 503 可以换供应商；流式输出一半后断开，重新生成可能与已展示文本不同；工具已经执行后模型响应丢失，更不能从头跑一遍。

我会定义 route attempt：每次模型调用独立记录，外层 request 聚合。只有 `no_side_effect_committed=true` 且错误属于 retryable class 时，才能启动下一 attempt。新 attempt 默认拿相同输入 Bundle，变更模型由 route event 明确记录。

fallback 链长度有限，受总 deadline 和总成本约束。三个模型依次等 30 秒不叫高可用。首选失败后若剩余时间不足，直接返回可重试错误，或使用已验证的降级模板。

结构化工具调用不能 fallback 到只会文本的模型。允许降级时，协议明确 `degraded_mode`，例如只能回答说明、不能执行动作。UI 不把降级文本继续渲染成“已处理”。

## 路由策略也要版本和回放

一次请求记录 route_policy_version、候选列表、过滤原因、各项分数、最终模型 snapshot 和 fallback events。发生质量问题时，能解释为什么当时选了它，而不是只看到一个供应商名。

策略更新先对历史请求离线回放，比较如果使用新权重会选谁，再对可复现样本真实调用。离线预测只用于筛选，最终还需 shadow/canary 验证，因为模型供应状态和延迟会变化。

健康度不是全局布尔值。某区域超时、某模型流式协议异常、某租户配额耗尽，需要按 provider/model/region/credential pool 细分。断路器状态进入 route reason，恢复时小流量探测，不瞬间把全部流量切回。

路由目标也不能在运行中偷偷变化。成本策略、质量门槛和供应商合同变更都发布新 policy version。这样月度成本下降时，能区分是模型价格、请求结构还是路由策略造成。

多模型网关最终要回答的不是“我们接了多少模型”，而是每类任务在什么约束下由哪个版本完成，失败时为什么换、换完是否仍满足原要求。先守硬边界，再优化质量、延迟和成本，路由才是工程能力，不是随机负载均衡。

## 参考论文与官方资料

- [FrugalGPT：通过 LLM cascade 与 routing 优化质量和成本](https://arxiv.org/abs/2305.05176)
- [OpenAI 2023-06-13 API 更新：Function Calling 能力与固定模型版本](https://openai.com/index/function-calling-and-other-api-updates/)
- [RFC 9110：HTTP 错误、Retry-After 与方法语义](https://www.rfc-editor.org/rfc/rfc9110)
- [OpenAI Evals：用任务用例评估不同模型行为](https://github.com/openai/evals)
