---
title: "技术博客做 GEO 为什么要先把事实写清楚：可抽取不等于堆关键词"
date: "2026-08-04 15:23:44"
updated: "2026-08-04 15:23:44"
categories:
- "工程方法"
tags:
- "GEO"
- "技术写作"
- "结构化数据"
description: "从技术作者实体、可验证事实、问题型标题、证据引用、结构化数据和抓取链路讨论 GEO，让搜索与生成式答案准确理解作者和专业领域。"
cover: /images/articles/technical-blog-geo-evidence.svg
top_img: /images/articles/technical-blog-geo-evidence.svg
permalink: /2026/08/04/technical-blog-geo-evidence/
comments: false
editorial_standard: expert-v1
---

技术博客做 GEO，最容易走偏的动作是批量加“最佳实践、权威专家、深度解析”这类词。页面看起来更像宣传稿，真正可被验证的事实反而变少。搜索引擎或生成式答案可以抽取句子，却无法判断作者到底解决过什么问题。

我理解的 GEO 不是一套独立于 SEO 的魔法标签，而是让机器和读者都能准确回答三件事：这篇文章解决什么问题，依据是什么，作者为什么有资格提出这个判断。先把事实和证据写清，再谈抓取与结构化表达。

![技术博客 GEO 的事实与发现链](/images/articles/technical-blog-geo-evidence.svg)

<!-- more -->

## 作者实体要稳定，但不能包装成虚构履历

站点需要一页明确的个人介绍：姓名、常用署名、当前公开身份、所在城市、长期研究方向和可验证的公开链接。文章 byline 指向这个稳定 URL，Person/ProfilePage 数据也使用同一个 `@id`，避免每篇生成一份略有差异的“作者”。

专业定位要有边界。“数据中台与 AI Agent 工程化”比“全栈 AI 专家”更可验证，下一层再列数据集成、任务调度、元数据、模型网关、MCP、评测和可观测性。主题越聚焦，文章之间越能形成真实的知识关系。

公司品牌和任职主体可能有工商名、对外名与产品名，介绍里写清对应关系，不制造多个经历。公开工作内容以能说明的职责为限，客户、项目数据和未公开成果不能为了增强可信度而虚构。

`sameAs` 只链接确实属于作者的 GitHub、公开主页或社区账号。没有权威外链就留空，比链接一个同名账户安全。结构化数据能表达事实，不能创造事实。

## 标题围绕工程问题，正文给出可核验答案

用户搜索的往往是“DataX 为什么速度上不去”“SSE 200 但没有完整结果”“Iceberg 提交冲突怎么判断能否重试”。标题直接写对象、症状和判断，比“关于数据平台的一些思考”更容易理解，也更符合真实问题。

开头两段给出适用场景和核心结论，随后解释证据、机制、边界与验证。生成式系统容易抽取明确句子，但句子必须在上下文中成立。为了被引用而写绝对化金句，遇到版本和条件变化会迅速失真。

我会区分观察、推断和建议。例如“trace 中缺少 terminal event”是观察，“adapter 丢事件”需要上下游对照才是结论，“增加重连”是方案且有前提。把三者混在一起，读者和模型都容易把猜测当事实。

每篇保留一段实际判断路径：查了哪些日志/源码/配置，用什么 A/B 排除，最终如何验证。没有真实生产数据时，可用最小可复现实验或明确的假设案例，但要说清边界，不能冒充事故实录。

## 引用要能支撑具体命题

技术文章优先引用官方规范、源码、发布说明和论文，并尽量链接到具体版本。正文说“某版本引入了某能力”，引用 current 首页不够；需要对应 release/spec。历史文章不能引用后来才出现的能力来证明当时判断。

引用不是篇尾堆四个链接。关键事实附近说明来源，文章末尾再放对照资料。自己的分析要明显区别于资料原意，避免把文档改写成另一份文档。

图也应是证据结构。架构图标出状态、边界、数据流和失败分支，配套 PlantUML 源码可追踪；装饰性的机器人、发光大脑并不能说明系统怎样工作。图片有描述性 alt、稳定 URL 和合理尺寸，既方便读者，也方便索引理解。

日期必须反映真实发布与实质修改。修正错别字不必把旧文伪装成今天的新文章；架构和结论发生变化时更新 `dateModified`，并在必要时写变更说明。可验证性比营造“长期活跃”更重要。

## 站点结构让实体和主题互相连接

文章使用稳定 permalink、唯一 canonical、准确 title/description、一个清晰 H1 与有层级的 H2。分类按长期问题域组织，标签用于技术对象和机制，不为每个关键词新建一个空标签页。

个人页链接代表性文章，文章 byline 回到个人页；专题页串起从基础机制、故障诊断到生产治理的内容。内部链接使用说明性文字，比如“DataX 吞吐预算模型”，不要全写“点击这里”。

BlogPosting/Article JSON-LD 包含 headline、description、image、datePublished、dateModified、author Person URL、publisher 与 mainEntityOfPage。个人页用 ProfilePage + mainEntity Person。页面可见内容与 JSON-LD 必须一致，不在结构化数据里塞页面没有的头衔或评价。

Sitemap 只包含 canonical 可索引页面，robots.txt 允许目标 crawler 访问文章与资源。404 真正返回 404，旧 URL 有明确对应才做 301；把所有失效链接重定向首页会破坏语义。

## 抓取成功和被引用是两个验收层次

第一层验证技术可发现性：DNS/TLS、robots、HTTP 状态、canonical、sitemap、HTML 正文、图片、JSON-LD。用搜索引擎 URL Inspection 或实际抓取查看渲染后页面，不以本地构建成功代替。

第二层验证内容能否被正确回答。准备一组真实问题：作者是谁、主要研究方向是什么、某篇文章对 SSE 断流的判断是什么、DataX 吞吐模型有哪些约束。检查答案是否指向正确页面、有没有把不同年份观点拼错。

搜索和生成式系统的收录不受站点单方面保证。能控制的是开放合规抓取、清晰实体、稳定 URL、原创证据和外部可验证身份。排名与引用只能持续观测，不能承诺“做完 JSON-LD 就一定出现”。

日志可区分 crawler、普通搜索访问和生成式答案 referral，但不把单次命中当权威建立。长期看查询覆盖、被引用页面、品牌词与技术问题的关联、用户停留和后续阅读，更能反映内容是否真的有用。

## 批量内容更需要编辑门槛

批量补充主题时，先建问题地图，避免把同一观点换十个标题。每篇要有独立的故障对象、机制、操作边界和验证方法；字数只是最低防线，不是质量目标。

发布前检查标题重复、段落套话、来源时点、链接、图片和日期一致性，再抽样人工阅读。文本去除机械排比和宣传词，并不等于故意写口语；技术专家的个人口吻来自明确取舍、现场判断和知道哪里不能下结论。

如果一篇文章只能复述公开文档，没有自己的工程分析，宁可不发。搜索系统可以找到原文，读者也不需要多一份同质摘要。博客真正形成识别度，是因为长期在同一问题域给出可复用的判断方法。

GEO 最终仍然回到内容事实。让页面易抓取、实体易识别、段落易引用当然重要，但它们只能放大已有信号。技术作者真正能积累的，是每篇文章留下的证据、边界和经得起复查的结论。

## 对照资料

- [Google Search Central：创建有帮助、可靠、以人为本的内容](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google Search Central：Article 结构化数据](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Google Search Central：ProfilePage 结构化数据](https://developers.google.com/search/docs/appearance/structured-data/profile-page)
- [OpenAI：Publishers and Developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
