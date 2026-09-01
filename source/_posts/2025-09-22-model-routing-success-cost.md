---
title: "模型网关别只看每百万 Token 单价：真正该算的是任务成功成本"
date: "2025-09-22 13:40:29"
updated: "2025-09-22 13:40:29"
categories:
- "AI Agent 工程化"
tags:
- "模型路由"
- "成本治理"
- "Agent 评测"
description: "把模型路由成本从单次 token 价格扩展到全部 attempts、fallback、工具、基础设施、人工接管与验证结果，按任务桶计算 Cost per Verified Success。"
cover: /images/articles/model-routing-success-cost.svg
top_img: /images/articles/model-routing-success-cost.svg
permalink: /2025/09/22/model-routing-success-cost/
comments: false
editorial_standard: expert-v1
---

模型网关做成本优化时，最容易比较的是每百万 input/output tokens 单价，然后把简单请求路由到便宜模型。真实 Agent 任务里，便宜模型如果更常生成无效工具参数、需要重试、触发 fallback 或人工接管，最终可能比贵模型花得更多。

我关注 `Cost per Verified Success`：一类任务从用户请求开始，到业务结果被验证成功，整条路径花了多少钱。失败 attempt、工具调用、检索、基础设施、人工和延迟机会成本都进入分子，不只算最后一次模型账单。

![模型路由优化的是每次验证成功的成本](/images/articles/model-routing-success-cost.svg)

<!-- more -->

## 先定义 Verified Success

摘要任务可以用事实覆盖与引用检查，SQL 用 parser/catalog/plan/结果断言，工具任务需要 operation/business state verified。HTTP 200 或模型 finish=stop 不是统一成功标准。

每个 task type 有 completion contract 和风险权重。无法确定业务结果时标 unknown，不为了报表把它算成功。用户点赞是辅助信号，不能覆盖工具实际失败。

成功标签可能晚到。任务重跑 operation 十分钟后完成，通过 run/operation ID 回填；路由训练使用 final label 与 label source，不拿即时“accepted”训练成成功。

同一请求被人工兜底后，用户目标完成，但 automated_success=false、assisted_success=true。两种都可统计，成本与自动化能力分开。

## 全路径成本包含失败尝试

模型成本按每个 attempt 的 provider usage 与 price snapshot 计算。流中途断开没有 usage 时标 estimated；缓存折扣、batch、区域价格也随当时单价版本。

检索/embedding/rerank、built-in tools、MCP/API、浏览器/沙箱和存储是直接成本。失败工具也计费；重复 operation 被幂等挡住仍有网关与模型开销。

fallback 把多个 attempt 累加。主模型输出 80% 后断流、备用从头生成，不能只把备用模型记到账单。路由器否则会偏好经常失败但首轮便宜的模型。

人工 review/接管可用标准时间成本或实际工时估算。高风险流程本来需要审批，不算模型失败；因参数错而人工修正，属于质量成本。

延迟按业务场景折算或至少单独约束。离线研究多等一分钟可能无妨，交互工具调用 p95 增加十秒会显著影响完成率。不要硬把所有延迟换成虚假货币，但要作为优化约束。

## 指标按任务桶而不是全站平均

SQL 生成、简单问答、研究报告、代码修复和生产运维的成功定义、上下文、工具与风险不同。全站 CPS 会被高频简单任务主导。

按 task type、risk、语言、context size、tool required、tenant policy 和 model snapshot 分桶。每桶展示请求量、verified success、unknown、attempts、fallback、token/tool/human cost、p95 latency。

样本小的桶不直接自动调权。使用置信区间/保守先验，先影子与灰度。模型升级、Prompt Bundle 或工具版本变化会使历史分布失效，指标按版本切片。

重要长尾任务设守门质量。成本再低也不能用权限违规或错误生产动作换成功率；先满足安全/质量门槛，再优化 CPS。

## 路由评分要考虑预期全路径

对候选模型估计：首轮成功概率、失败类型分布、重试/fallback 概率、tokens、工具路径和延迟。预期成本不是 `price × expected tokens`，而是所有路径的加权和。

```text
E[cost] = first_attempt
        + P(retry) * retry_path
        + P(fallback) * fallback_path
        + P(human) * assisted_path
```

先按硬能力、数据地域、权限和上下文过滤，再在可用候选中优化 `E[cost] / P(verified_success)`。当分母太低时，不让低价掩盖不可用。

FrugalGPT 讨论了使用 LLM cascade/routing 在质量和成本间优化。企业 Agent 还要把工具与验证纳入 reward/cost，否则只优化文本答案，忽略真实执行结果。

探索流量有严格上限。新模型先在低风险桶获取样本，不用生产高风险任务做在线赌博。route decision 记录候选、分数、uncertainty 和 policy version。

## 失败分类决定是否 Fallback

Provider 503/429、协议 malformed、model invalid output、policy deny、tool state conflict、business validation failed 的处理不同。policy deny 换模型没有意义；tool 已执行后换模型只能重新总结，不能再调用。

Fallback 规则同时检查剩余 deadline、预算、side-effect status 和能力硬约束。每次 attempt 有新 ID，复用已完成 artifacts；不会把已输出给用户的半段与新模型无痕拼接。

连续相同 error/no progress 触发停止。一个便宜模型在同一 schema error 上自修复五次，会迅速放大成本。错误有允许 recovery action，而不是让模型无限尝试。

失败成本反向进入模型评分。某 snapshot 在 function calls 经常 invalid，工具桶 CPS 上升，即使普通问答仍便宜，不影响它在其他桶使用。

## 成本改动必须做因果验证

降低 CPS 可能来自业务输入变简单、知识缓存命中增加或价格变化，不一定是路由更好。策略实验固定流量分桶和 Bundle，old/new 同期随机分配，比较 verified outcomes 与完整成本。

报告展示 numerator/denominator 变化。CPS 下降若因为系统把更多困难任务标 unknown/拒绝，不是真优化；成功率、coverage、拒答和用户影响一起看。

价格用运行时 snapshot，不用今天单价重算所有历史后声称策略改善。技术模拟可以用统一价格重算，财务实账与模拟视图分开。

线上异常可以从 CPS 下钻到 attempts、raw events、tool operations 和人工接管原因。优化动作针对真实浪费：压上下文、修协议重试、改工具 schema、调整 route，不是简单换最便宜型号。

模型单价是采购参数，任务成功成本才是工程指标。把失败路径和业务验证纳入账本后，路由策略才会奖励真正稳定完成任务的模型，而不是奖励一次调用看起来便宜。

## 参考论文与资料

- [FrugalGPT：LLM cascade 与成本/质量优化](https://arxiv.org/abs/2305.05176)
- [OpenAI 2025 Responses API：模型、内置工具与 Agent 构建模块](https://openai.com/index/new-tools-for-building-agents/)
- [OpenAI Evals：按任务用例验证模型行为](https://github.com/openai/evals)
- [Google SRE Workbook：基于用户可见结果定义 SLI/SLO](https://sre.google/workbook/implementing-slos/)
