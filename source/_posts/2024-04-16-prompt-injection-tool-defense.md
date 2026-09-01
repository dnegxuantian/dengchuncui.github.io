---
title: "Prompt Injection 怎么防：先把不可信内容与工具权限彻底拆开"
date: "2024-04-16 14:35:21"
updated: "2024-04-16 14:35:21"
categories:
- "AI Agent 工程化"
tags:
- "Prompt Injection"
- "Agent 安全"
- "工具调用"
description: "从直接与间接 Prompt Injection 出发，用来源信任标签、最小工具面、确定性授权、确认、输出隔离和可回放审计限制不可信内容影响真实动作。"
cover: /images/articles/prompt-injection-tool-defense.svg
top_img: /images/articles/prompt-injection-tool-defense.svg
permalink: /2024/04/16/prompt-injection-tool-defense/
comments: false
editorial_standard: expert-v1
---

Prompt Injection 不是在 system prompt 后面多写一句“不要听用户的”就能解决。Agent 会读取网页、文档、邮件和工具输出，这些内容都可能包含类似指令的文本。模型很难只凭自然语言可靠区分“这是数据”还是“这是更高优先级命令”。

我的防线不建立在模型永远识别攻击上，而是建立在权限与执行分层：不可信内容可以影响候选答案，不能自行提升为控制指令；任何工具动作仍需通过确定性的对象、权限、状态和确认检查。

![不可信内容不能直接变成工具指令](/images/articles/prompt-injection-tool-defense.svg)

<!-- more -->

## 先承认间接注入一定会进入上下文

直接注入来自用户输入，例如要求忽略之前规则。间接注入藏在 Agent 读取的数据里：网页白字、文档注释、工单描述、代码 README，甚至另一个工具的错误信息。只对用户输入做关键词过滤，挡不住后者。

OpenAI 在 2023 年 Function Calling 发布说明中已提到，来自不可信工具输出的数据可能指示模型执行非预期动作，并建议真实世界操作加入用户确认。工程上应把所有外部内容默认标为 untrusted data，即使它来自公司内部系统。

每段上下文携带 source、owner、trust_level、ACL、content hash 和获取时间。Prompt 用固定边界标识数据，但边界只是帮助模型理解，不是安全保证。执行层不根据内容里的“管理员已批准”改变策略，审批只能来自可信系统签发的 token。

HTML/PDF 清洗会减少隐藏文本、脚本和不可见字符，却不能把内容洗成可信。清洗后仍保留 untrusted 标签，也记录被删除结构用于安全分析。

## 控制面与数据面分开构建

system policy、工具 schema、用户身份和服务配置属于控制面；检索文档、网页正文、用户附件和工具返回属于数据面。运行时把二者用独立数据结构组装，不在字符串拼接后再猜来源。

工具调用器只接收模型生成的 proposal 与可信 subject context。模型不能从上下文输出一段“新增工具定义”让 runtime 动态注册，也不能通过文档中的 URL 让通用 HTTP 工具任意访问。

检索内容最小化。问题只需要配置说明，就不把整页含评论、脚本和外链的 HTML 放进上下文。结构化工具只返回必要字段，错误堆栈与内部 headers 不进入模型。攻击面与上下文 token 同时下降。

多轮会话要防持久化。一次文档中的恶意文本可能被模型总结进 memory，后续离开原页面仍影响决策。写入长期记忆前提取事实并验证来源，不把自由文本指令原样保存；memory item 保留 provenance 和 trust label。

## 最小工具面比“聪明识别”可靠

Agent 只获得当前任务需要的工具。浏览文档阶段不需要 send_email、delete_file 或 deploy，就不要注册这些工具。把所有平台 API 都放进一份 function list，再依赖模型自律，风险会随工具数量与组合能力增长。

工具接口做窄：`get_page(url)` 配 egress allowlist，不能访问内网 metadata；`download_attachment(id)` 只能读取用户已授权附件；`update_ticket` 限定字段，不能传任意 JSON Patch。底层服务账户按最小权限配置。

参数通过 JSON Schema、对象解析和 policy engine。URL 校验在 DNS 解析前后都做，防重定向和 DNS rebinding；文件路径使用资源 ID，不接受 `../`；SQL 使用只读代理。模型是否被注入，不影响这些确定性规则。

高风险动作先 dry-run。用户看到目标资源、参数、影响和来源，再签发 plan-bound confirmation。若动作源于网页内容，UI 明确标出“建议来自未信任页面”，让人知道确认什么。

## 工具输出不能反过来扩大权限

工具 A 的返回中可能包含另一个动作建议，模型随后调用工具 B。策略不能因为 A 是受信工具，就把 A 返回的所有文本视为可信命令。工具身份可信，只表示响应来自它；响应中引用的用户内容仍可能不可信。

结构化结果区分 data 与 control hints。只有工具协议中明确、签名并由 runtime 认可的字段能触发状态转换，例如 `operation_status=succeeded`；message、description、error_text 都只是数据。

结果进入模型前做字段 allowlist、长度限制和秘密扫描。内部 URL、token、堆栈不返回。对于可能包含网页内容的字段，保留 nested provenance，不能一层工具包装后信任级别自动升高。

Agent loop 设置步数、成本、时间与工具调用配额。Prompt Injection 诱导无限搜索或循环调用时，runtime 能停止。异常序列如读取文档后立即请求高风险工具、短时间跨多个资源，触发额外确认或阻断。

## 防御需要用真实攻击链回归

安全测试不能只有“忽略之前指令”一句。要覆盖 PDF 隐藏文字、网页评论、Markdown 链接、工具 error message、代码注释、多语言、编码混淆、跨轮 memory 和引用文档中的二级链接。

每个用例断言系统行为：敏感工具不可见或被 policy 拒绝，越权对象不解析，确认参数不被替换，不可信内容不写入长期 memory，拒绝原因不泄露内部策略。

trace 串起 injection source、retrieval chunk、模型 proposal、policy decision 和实际 operation。发现工具被误调用时，可以证明是哪段内容影响了模型，也能验证即便 proposal 错误，执行层是否挡住。

模型/Prompt 更新后重跑攻击集，但不能把通过测试理解成“已解决 Prompt Injection”。模型行为会变化，攻击输入空间无限。目标是让单次模型误判无法越过权限和副作用边界，并让所有尝试可见、可停、可追踪。

## 事件处置从撤权开始

发现注入导致异常动作时，先撤销相关 tool/credential、冻结 operation 和隔离 source，不是只改 Prompt。检查同一 source 是否进入索引、缓存与 memory，按 content hash 追踪所有受影响 Run。

动作幂等与可回滚决定损失范围。发送类工具保留消息 ID 可撤回，配置变更保存旧版本，批量操作分批提交。无法回滚的工具默认需要更强确认与人工审批。

最后再修复检索过滤、工具 schema、策略或模型提示，并用原始 trace 回放。只在 Prompt 里追加攻击字符串黑名单，很快会被变体绕过，也无法修复已落地的副作用。

Prompt Injection 应被当作不可信数据穿过智能决策系统的问题。模型层可以提高识别率，真正的安全性来自控制面隔离、最小工具、确定性授权、确认和审计。即使模型相信了文档里的坏指令，系统也不应替它获得执行权。

## 对照资料

- [OpenAI Function Calling 发布说明：不可信工具数据与用户确认风险](https://openai.com/index/function-calling-and-other-api-updates/)
- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [NIST SP 800-162：基于属性的访问控制](https://csrc.nist.gov/publications/detail/sp/800-162/final)
- [OWASP SSRF Prevention Cheat Sheet：URL 与网络访问边界](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
