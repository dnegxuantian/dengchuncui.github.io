---
title: "工具注册表不只是函数清单：能力、风险和兼容性都要版本化"
date: "2024-10-13 15:14:06"
updated: "2024-10-13 15:14:06"
categories:
- "AI Agent 工程化"
tags:
- "工具注册表"
- "能力治理"
- "版本管理"
description: "把 Agent 工具定义扩展为带输入输出 schema、权限、风险、幂等、超时和错误语义的 Capability Manifest，并设计不可变版本、契约测试、别名发布和弃用。"
cover: /images/articles/tool-registry-capability-version.svg
top_img: /images/articles/tool-registry-capability-version.svg
permalink: /2024/10/13/tool-registry-capability-version/
comments: false
editorial_standard: expert-v1
---

Agent 工具多起来后，最初那份 `name + description + parameters` 列表很快不够用。平台不知道哪个工具有副作用、能否自动重试、需要什么权限、错误如何分类，也不知道 schema 改动会影响哪些 Prompt 和运行中的 Agent。

我把工具注册表做成 Capability Registry。注册项不仅供模型选择，也供路由、策略、执行器、审计和发布系统使用。每个版本不可变，Agent Bundle 固定 registry snapshot，运行中不会看到工具定义漂移。

![工具注册表发布的是可验证能力版本](/images/articles/tool-registry-capability-version.svg)

<!-- more -->

## Manifest 先描述执行语义

一个工具版本至少包含 input/output/error schema、owner、risk level、required permissions、side effect、idempotency、timeout、retry policy、confirmation、data classification 和 endpoint binding。

`read_only=true` 不能只写在 description。执行器根据结构字段决定能否重试、是否允许影子调用；策略根据 action/resource type 做授权；UI 根据 confirmation schema 渲染计划。

错误 schema 列出稳定 code、retryable 与 recovery actions。底层 Java/HTTP 异常由 adapter 映射，不把任意 message 交给模型决定下一步。未知错误默认不可重试并保留 native ref。

结果 schema 同样重要。HTTP 200 但缺 operation ID，或字段类型变化，应判协议失败。模型只看到验证后的有限结果，原始 body 留在受控审计。

## 版本由内容和兼容性决定

工具 ID 稳定，例如 `jobs.rerun`；版本 `v3` 指向不可变 manifest 与实现契约，schema 有独立 hash。修改 description 也可能改变模型选择行为，因此仍发布新 registry version，即使后端 API 未变。

兼容性分三类。新增 optional 输出字段通常向后兼容；新增 required 输入、收紧枚举或改变错误含义不兼容；修改 description/风险提示属于行为兼容性，需要评测而不是只看 JSON Schema。

语义版本号可以表达承诺，但真正判定依赖 diff 规则与 owner 审核。自动检查 required、type、enum、additionalProperties 和 error codes；行为变化由变更说明列出假设和回归桶。

一次 Run 固定 exact tool versions。使用 `latest` 只发生在 Bundle 构建/发布阶段，不能每轮从 registry 动态解析。否则用户确认 v2 计划，执行时工具已变 v3，plan hash 失去意义。

## 注册前必须通过契约测试

Provider/工具 owner 提供 sandbox 或 mock fixtures。Registry CI 验证 schema、鉴权、timeout、取消、幂等、重复调用、部分成功、错误映射和敏感字段脱敏。

happy path 只占一小部分。创建类工具要测试客户端 timeout 后查询 operation、相同 idempotency key 不重复创建、不同参数冲突；查询类测试权限过滤和结果上限；异步工具测试 accepted 不被当 completed。

模型选择评测使用真实名称和 description，验证该调用时选中、不该调用时不选、歧义时追问。工具 schema 本身合法，并不保证描述让模型正确理解。

通过后产出签名 manifest/hash。Registry 不允许运行时服务自己覆盖 schema；实现部署与 registry binding 有显式 rollout，二者版本不匹配时停止接流。

## Alias 发布与回滚要原子

业务使用 `prod:jobs.rerun` alias 指向一个已验证版本。新版本先离线/影子，再灰度特定 Agent Bundles，最后切 alias。旧版本保留兼容窗口，运行中的 Run 继续使用。

回滚 alias 不代表回滚已产生的动作。执行审计记录实际 tool version、endpoint build 和 operation ID；若 v3 产生错误变更，需走业务补偿。Registry 只恢复后续调用。

健康路由也不能改变契约。主 endpoint 不健康切备 endpoint 时，备实现必须通过同版本 contract tests；不能把调用转到参数相似但语义不同的旧 API。

alias 变更、审批、灰度范围和观测指标进入发布记录。绕过 registry 直接让 Agent 调内部 URL，失去所有版本与策略保证，应在网络/身份层禁止。

## 弃用先看使用图

下线工具版本前，Registry 从 Run traces 与 Bundle manifests 构建使用图：哪些线上 Agent、Prompt examples、评测用例和未完成 Runs 仍引用。不能仅凭“一个月没有新调用”删除，因为长流程可能仍在等待确认。

deprecation 包含 announce、no-new-binding、sunset、disabled 四阶段。构建新 Bundle 时禁止绑定 deprecated 版本，旧 Bundle 在兼容期继续；到 sunset 前完成迁移与回归。

替代工具提供 migration mapping，但不让 runtime 自动把老参数猜成新参数。不兼容迁移在 Bundle 构建时显式完成，生成新的 tests 和 plan hash。

紧急禁用用于安全事故，可立即让策略拒绝新执行；运行中的 operation 根据风险选择取消、冻结或继续。状态与用户提示明确，不能表现成模型突然“不会调用”。

## Registry 也是治理和观测入口

每次调用记录 registry snapshot、tool version、schema hashes、policy decision、latency、error code 与 outcome。Dashboard 能按工具版本看成功率、参数错误、权限拒绝、重试和副作用验证。

owner 收到的是可行动问题：v3 `OBJECT_AMBIGUOUS` 上升、timeout 后重复请求被幂等挡住多少次、哪些结果字段经常缺失。不是一个笼统的 Agent failure rate。

权限和数据分类变更也发布新 manifest/policy binding。description 不泄露内部对象和策略细节，模型可见视图与执行器完整视图分开，但共享同一个 capability ID/version。

工具注册表成熟后，Agent 才能在不断增长的能力中安全选择。它不是一份给模型看的函数列表，而是连接设计、权限、执行、测试和生命周期的契约中心。

## 对照规范与资料

- [JSON Schema 2020-12 Core：schema 与 vocabulary](https://json-schema.org/draft/2020-12/json-schema-core)
- [OpenAPI 3.0.3：Operation、Parameter、Request Body 与 Responses](https://spec.openapis.org/oas/v3.0.3)
- [Semantic Versioning 2.0.0：兼容性与版本约定](https://semver.org/spec/v2.0.0.html)
- [OpenAI 2023 Function Calling：函数描述与 JSON Schema 参数](https://openai.com/index/function-calling-and-other-api-updates/)
