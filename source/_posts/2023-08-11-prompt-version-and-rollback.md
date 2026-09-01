---
title: "Prompt 也要版本、灰度和回滚：真正需要冻结的是运行组合"
date: "2023-08-11 18:04:25"
updated: "2023-08-11 18:04:25"
categories:
- "AI Agent 工程化"
tags:
- "Prompt 工程"
- "版本管理"
- "发布治理"
description: "把 Prompt、模型 snapshot、工具 schema、检索策略和输出解析器组成不可变运行 Bundle，用内容哈希、离线回归、灰度分流和版本别名实现可解释发布与回滚。"
cover: /images/articles/prompt-version-and-rollback.svg
top_img: /images/articles/prompt-version-and-rollback.svg
permalink: /2023/08/11/prompt-version-and-rollback/
comments: false
editorial_standard: expert-v1
---

Prompt 从十几行增长到几百行后，很容易变成一份“谁都能改、没人敢删”的线上配置。有人为了修一个格式问题加两句指令，第二天工具选择率下降；回滚时只把文本改回去，结果仍和上周不同，因为模型别名、工具 schema 或检索模板已经变了。

我不把 Prompt 单独视为版本单位。真正决定一次模型行为的是完整运行组合：system prompt、消息模板、模型 snapshot、sampling 参数、工具定义、检索/上下文策略和输出 parser。它们一起形成不可变 Bundle，发布与回滚都指向 Bundle ID。

![Prompt 变更按软件版本发布](/images/articles/prompt-version-and-rollback.svg)

<!-- more -->

## 文本版本不等于行为版本

同一 Prompt 发给 `gpt-4` 通用别名，供应商升级后输出可能变化。OpenAI 2023 年 6 月的发布说明明确提到新模型版本可能在部分任务上退化，并提供固定 snapshot 名称，让应用可以 pin 版本。

工具描述变化也会影响选择。把 `get_job` 的 description 改得更宽泛，模型可能在无需工具时调用它；新增 required 字段后，旧 few-shot 的参数样例又不再合法。检索 top-k 或 chunk template 改动，会改变模型实际看到的事实。

因此一次运行至少记录：

```text
bundle_id / content_hash
model_provider / model_snapshot / parameters
system_prompt_version / template_version
tool_registry_version / schema hashes
retrieval_policy_version / index_version
output_parser_version / policy_version
```

Bundle 创建后不可原地编辑。配置中心的 `prod` 只是指向某个 Bundle 的别名，切换别名才是发布动作。历史请求永远能找到当时组合，不会因为模板被覆盖而无法复现。

## 变更必须写清假设

“优化 Prompt”不是可验收的变更说明。提交时要写：观察到什么失败、准备修改哪一段、为什么能影响这个失败、可能伤害哪些场景、用哪些指标验收。

例如修复工具参数缺日期：在 system prompt 增加日期解析规则，预期 `MISSING_REQUIRED_FIELD` 下降；风险是模型把模糊“最近”猜成具体范围，需同时观察追问率和错误日期率。这样评审者能判断方案是否对因，也知道回归关注什么。

Prompt 存入 Git 适合代码评审和 diff，但线上配置还需要构建产物。构建时解析 include、变量和工具 schema，生成 canonical JSON，再计算 hash。只对源文件 hash，无法覆盖依赖模板变化；只存渲染文本，又失去模块来源。

敏感信息不进入 Prompt 仓库。环境地址、token 和租户数据由运行时安全注入，并在 Bundle manifest 中只记录 secret reference。回放环境使用测试凭据，不能因为复现 Prompt 把生产秘密带出来。

## 离线评测分能力与守门用例

回归集来自真实失败，按正常能力、拒答、安全、工具边界和格式解析分组。新 Bundle 不只要提高目标指标，还必须通过守门用例：越权请求仍拒绝、高风险动作仍确认、无证据时不编造、输出仍能被 parser 接受。

评测输入固定 user messages、授权上下文、检索结果或 tool mocks。若一边改 Prompt 一边换索引，结果无法归因。需要验证全组合时，再做独立端到端集，明确这是综合发布而非 Prompt 单变量实验。

生成有随机性，单条跑一次没有统计意义。关键用例重复运行，比较成功率、错误类型、token 和 latency 分布。对严格 JSON/工具参数可以做确定断言；自然语言答案用事实点、引用和禁用内容断言，不依赖逐字相同。

评测结果绑定 Bundle hash。后来修改了同名文件，旧报告不能继续显示为“已通过”。发布系统只接受当前 hash 的报告，并记录评测代码/数据集版本。

## 灰度要固定分流并保留旧结果

离线通过后先影子运行：真实请求仍由旧 Bundle 服务，新 Bundle 在合规范围内异步执行，结果不展示给用户。比较工具选择、错误、答案断言、延迟和成本，发现只在真实分布出现的问题。

进入灰度时按 user/session hash 固定分流，避免同一会话前后使用不同 Prompt。Agent 有历史上下文时，Bundle ID 应绑定整个 run，不能在工具调用一半切版本。

旧、新链路记录相同观测字段。只比较点赞率容易受用户分布干扰，还要看 refusal、tool error、invalid output、human correction、cost 和 p95 latency。高风险失败设绝对阈值，一旦出现立即停止灰度，不等总体平均值。

影子调用会增加成本和数据处理范围，需要明确采样率、脱敏和保留策略。不能为了实验把原本不出域的数据发给另一个供应商。

## 回滚不是改回一段文字

回滚动作把 `prod` alias 原子指回上一个已验证 Bundle。正在执行的 run 继续使用启动时版本，新 run 使用回滚版本；否则一个 Agent loop 中前后工具描述不同，状态无法解释。

数据库 schema、工具后端或索引若已做不可兼容变更，旧 Bundle 可能无法运行。因此发布前要声明兼容窗口：新工具 schema 至少支持旧 Bundle 一段时间，索引 alias 保留旧版本，output storage 能识别两版事件。

回滚触发条件预先定义，例如 invalid tool arguments 连续超过阈值、权限守门用例失败、完成率下降、成本增长超过预算。人工也可回滚，但必须填写 incident/reference，不能在配置中心手改一段 Prompt 后绕过审计。

回滚后保留失败 Bundle 和请求证据，分析完成再建新版本。禁止覆盖原 Bundle“修一下再发”，否则事故现场消失，评测报告与产物 hash 也对不上。

## 线上每次回答都能定位版本

响应 metadata 和 trace 包含 Bundle ID、model snapshot、tool registry/index/parser 版本。用户反馈某次答案错误时，可以直接抽取同一组合回放，而不是先猜当天谁改过 Prompt。

对于流式响应，版本在首个事件前确定并贯穿全流；重试创建新 attempt，但默认沿用同一 Bundle。若因模型不可用切换 fallback，要生成明确 route event，最终结果标注实际组合，不能继续冒充原版本。

版本管理不会让模型行为变成完全确定，但能把变化范围收窄到可分析。Prompt 工程进入生产后，最重要的能力不是写出一段永远正确的指令，而是知道哪次改变带来了什么效果，退化时可以在几分钟内回到已验证状态。

## 对照官方资料

- [OpenAI 2023-06-13 API 更新：固定模型 snapshot 与版本升级边界](https://openai.com/index/function-calling-and-other-api-updates/)
- [Git Objects：内容寻址对象与不可变对象模型](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [Semantic Versioning 2.0.0：版本与兼容性约定](https://semver.org/spec/v2.0.0.html)
- [OpenAI Evals：面向模型行为的开源评测框架](https://github.com/openai/evals)
