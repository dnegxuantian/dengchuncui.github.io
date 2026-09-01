---
title: "模型输出符合 JSON Schema，为什么仍然不能直接执行"
date: "2024-07-20 10:17:33"
updated: "2024-07-20 10:17:33"
categories:
- "AI Agent 工程化"
tags:
- "结构化输出"
- "JSON Schema"
- "语义验证"
description: "把模型结构化输出的验证拆成 JSON 解析、Schema、归一化、跨字段业务语义和执行前绑定五层，避免形状合法但对象、时间、权限或状态错误。"
cover: /images/articles/structured-output-semantic-validation.svg
top_img: /images/articles/structured-output-semantic-validation.svg
permalink: /2024/07/20/structured-output-semantic-validation/
comments: false
editorial_standard: expert-v1
---

模型能稳定返回 JSON 后，很多 Agent 链路会直接反序列化并调用后端。JSON Schema 确实能挡住缺字段、类型错和非法枚举，但它无法证明 `job_id` 指向用户想要的任务，也无法证明开始时间早于结束时间、资源仍处于可操作状态。

我把结构化输出看成候选命令。它要经过解析、schema、归一化、业务语义和执行前绑定五层，最后才成为工具可接受的 command。结构正确只是第二层，不是执行许可。

![结构正确之后还要做语义归一与状态校验](/images/articles/structured-output-semantic-validation.svg)

<!-- more -->

## 第一层先保证拿到完整 JSON

流式响应里 arguments 可能分多帧到达，连接 EOF 前不能解析；非流式也可能被长度限制截断。先检查模型 finish 状态、内容字节上限、UTF-8、JSON 完整性、嵌套深度和重复 key 策略。

不同 JSON parser 对重复 key 可能取第一或最后一个。`{"role":"user","role":"admin"}` 若各层处理不同，会形成安全差异。我倾向直接拒绝重复 key，并使用同一 canonical parser 生成后续 hash。

数值也要限制。JSON 允许的数在具体语言里可能溢出或丢精度；时间、金额和 ID 不用浮点自由表示。大数组和深层对象在 schema 前就设资源上限，防止解析器消耗过大。

解析失败可以让模型有限修复一次，但原输出与 repair attempt 都保存。不能把半个 JSON 猜补完整后继续执行，尤其涉及副作用时。

## Schema 只验证结构契约

JSON Schema 适合声明 type、required、enum、pattern、min/max、array size 和 `additionalProperties: false`。工具版本固定 schema hash，调用与审计知道当时按哪份契约验证。

未知字段默认拒绝，不静默丢弃。模型生成 `force=true` 而旧客户端忽略，可能让人误以为生效；未来服务端新增同名字段时，历史输出又改变含义。

格式关键字也有边界。`format: date-time` 能检查字符串形状，不决定业务时区、是否允许未来时间、是否处于变更窗口。pattern 匹配 resource ID，也不证明对象存在或属于当前租户。

schema 版本与工具实现保持兼容窗口。新增 optional 字段可以兼容，修改枚举含义或 required 字段要发布新版本。Agent Run 固定工具 schema，不在中途切换。

## 归一化必须在授权之前固定

模型可能输出“明天”“8 点”“10GB”“订单同步任务”。执行策略需要确定值：RFC 3339 时间、字节数、稳定 resource ID。归一化产生 canonical arguments，后续权限、确认和幂等都绑定它。

相对时间用用户时区和 Run 创建时间解析，结果同时保留原表达。夏令时歧义、缺时区或跨日范围不能默认猜。容量单位明确 GB 是十进制还是 GiB 二进制，金额带币种。

对象名称通过 resolve 工具得到候选 ID。多个同名对象时暂停确认，不选最高相似度。展示名可以变，command 只携带 ID + expected version。

字符串规范化要谨慎。自动 trim 对普通描述无碍，对密码、代码、路径或签名可能改变含义。每个字段声明 normalization policy，不能全局套一套清洗。

## 业务语义覆盖跨字段与当前状态

`start_at` 和 `end_at` 单独都合法，组合可能 end 在 start 前；补数范围合法，但超过 31 天配额；`target_state=STOPPED` 合法，但任务已经 SUCCESS。它们需要读取业务规则和实时状态。

验证输入是 subject、canonical arguments、resource snapshot 和 policy version。输出不只 true/false，还包含 reason code、obligations、expected resource version 和 evidence refs。

跨对象约束也在这里。把作业移动到另一个项目，需要源/目标项目权限、类型兼容和依赖影响。schema 很难表达图关系和动态配额，硬塞进 description 让模型遵守更不可靠。

语义失败不总能自动修复。对象歧义需问用户，权限拒绝直接停止，状态冲突可刷新后重新预览，参数业务不合法可给允许范围。错误类型决定 recovery，不让模型对所有失败自由猜下一步。

## 执行前绑定防止确认后换参

高风险命令把 canonical arguments、subject、resource ID/version、tool/schema version 和 expiry 计算 plan hash。用户确认或审批 token 绑定这个 hash。

执行服务重新读取资源，compare expected version，再做一次权限与语义检查。确认到执行之间状态变化，就返回冲突并要求新 plan。不能因为用户已经点过确认就跳过当前状态。

幂等键也绑定 canonical hash。同一 call ID 但参数不同直接冲突；相同参数重复请求返回之前 operation。timeout 后先查 operation status，避免重复副作用。

最终命令只包含工具实现需要的字段，模型原文作为审计引用，不传给底层。执行结果按 result schema 和业务状态回读验证，HTTP 200 不直接等于成功。

## 测试要覆盖“合法但错误”

常规 schema 测试只覆盖 missing、wrong type、bad enum。更重要的用例是每个字段都合法但组合错误：跨租户 ID、过期 version、日期倒置、超范围、确认后修改、对象刚被删除、同名歧义。

Property-based testing 可以生成边界值与字段组合，断言验证器不会崩溃、不会绕过策略。生产失败去敏后进入回归，按 parse/schema/normalize/semantic/bind 分桶。

监控也按层统计。schema invalid 高可能是工具描述差，semantic conflict 高可能是对象状态变化快，resolve ambiguous 高说明命名治理不足。所有失败叫“模型 JSON 错了”，会让 Prompt 越写越长却修不到根因。

结构化输出的意义，是把自然语言建议变成可验证数据，不是把模型直接变成 RPC 客户端。JSON Schema 建好形状边界后，还要把单位、身份、权限、状态和确认交给确定性代码，才有资格执行。

## 对照规范与资料

- [JSON Schema 2020-12 Core：schema 与实例的核心模型](https://json-schema.org/draft/2020-12/json-schema-core)
- [JSON Schema 2020-12 Validation：类型、required、enum、数值与数组约束](https://json-schema.org/draft/2020-12/json-schema-validation)
- [RFC 8259：JSON 数据交换格式与对象/数值语义](https://www.rfc-editor.org/rfc/rfc8259)
- [OpenAI 2023 Function Calling：按 JSON Schema 描述函数参数](https://openai.com/index/function-calling-and-other-api-updates/)
