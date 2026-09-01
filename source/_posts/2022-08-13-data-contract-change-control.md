---
title: "数据契约不是冻结 Schema：怎样让字段变化可检查、可迁移、可回滚"
date: "2022-08-13 17:41:07"
updated: "2022-08-13 17:41:07"
categories:
- "数据治理"
tags:
- "数据契约"
- "Schema Evolution"
- "Apache Avro"
description: "结合 Apache Avro 1.11.1 的 Writer/Reader Schema Resolution，说明数据契约如何覆盖字段、语义、质量、SLA、消费者影响与分阶段发布。"
cover: /images/articles/data-contract-change-control.svg
top_img: /images/articles/data-contract-change-control.svg
permalink: /2022/08/13/data-contract-change-control/
comments: false
editorial_standard: expert-v1
---

数据契约一旦被理解成“上游不许改字段”，很快就会失效。业务一定会增加状态、调整口径、拆分字段，平台不可能靠审批把变化冻结。真正需要禁止的是未经识别、没有迁移窗口、出了问题无法回滚的变化。

我把契约看成生产者与消费者之间的变更协议。Schema 是其中可机器检查的一层，除此之外还要写清字段含义、主键、时间语义、空值、质量阈值、交付时效、owner 和弃用期限。契约的目标不是少改，而是让每次修改都有证据链。

![数据契约从变更提案到完成或撤回](/images/articles/data-contract-change-control.svg)

<!-- more -->

## Schema 兼容只能挡住一部分事故

Apache Avro 的演进模型很适合解释兼容边界。数据按 writer schema 写入，应用用 reader schema 读取；两者不同时，根据 Schema Resolution 规则匹配字段、应用 default 或做有限类型提升。

例如 writer 没有新字段，而 reader schema 为该字段提供 default，reader 可以补上默认值。若 reader 要求一个 writer 不存在、又没有 default 的字段，必须报错。`int` 可以提升为 `long`，但反过来可能溢出，不能当成兼容变化。

这类检查能回答“字节能否被新旧代码解码”，却回答不了业务语义是否兼容。把 `amount` 从“分”改成“元”，类型仍是 long；把 `event_time` 从业务发生时间改成写入时间，timestamp 仍合法；状态码 2 原来表示 CANCELLED，后来改成 CLOSED，Schema Registry 也不会报警。

所以契约评审至少分两栏：structural compatibility 与 semantic compatibility。前者交给 Avro/Protobuf/表 schema 工具，后者必须由生产者说明，并由实际消费者和指标验证。

## Default Value 不是给生产者偷懒的

Avro 规范里的 field default 用于 reader 读取一个缺少该字段的旧 writer record，不代表 producer 编码时可以省略必填字段。规范明确说明，即使字段值等于 default，Avro 仍会编码这个字段。

这条细节在数据平台里经常被用错。上游说“新字段有默认值，所以老数据自动兼容”，下游却把默认值当真实业务值。若 `country` 默认 `CN`，旧记录没有 country，reader 补出的 CN 只是技术兼容值，不一定是事实。

我会把 default 分成三类：确定的业务缺省、未知值占位、仅用于历史读取。第二类应使用明确的 UNKNOWN/null 语义，不要伪装成正常枚举；第三类要在元数据中标注 `inferred_from_schema_default=true`，避免质量规则把补值后的非空率当成源数据质量。

新增 nullable 字段通常结构上安全，业务上仍要回答：什么时候开始有值、历史是否回填、未回填记录怎样解释、下游何时可以依赖它。没有这些答案，“向后兼容”只是解码兼容。

## 变更必须绑定消费者清单

很多契约平台只保存 producer owner，没有可靠消费者。要变更时群发一条消息，没人回复就默认没有影响。实际消费者可能是一个月跑一次的财务任务、临时 notebook、导出接口或几个月未发布但仍在用的服务。

我会从运行证据建立消费者清单：Kafka consumer group、表血缘、查询日志、任务调度、API access log。每个消费者记录 owner、最后活跃时间、读取字段、writer/reader schema 版本、SLA 和环境。

静态 SQL 血缘只能找到显式列引用。`SELECT *`、JSON 解析、反射读取和离线文件下载都可能漏掉，因此还要结合运行访问。反过来，半年未运行的测试作业不能永久阻塞变化，可以按治理规则进入过期确认。

变更影响不能只标 high/low。我更喜欢列出具体失败模式：旧 reader 无法解析、字段变 null、枚举落 default、Join key 改变、分区裁剪失效、指标口径漂移。这样 owner 才知道该验证什么。

## 兼容方向取决于发布顺序

“backward compatible”经常被说成一个绝对结论，其实它总是相对于谁读谁写。

新 reader 读取旧 writer 数据，需要 backward compatibility；旧 reader 读取新 writer 数据，需要 forward compatibility。滚动发布期间，新旧 producer 和 consumer 会同时存在，若要求任意组合都能工作，才需要 full compatibility。

常见新增字段流程是先发布能够接受新字段的 consumer，再让 producer 开始写；删除字段则先让所有 consumer 停止依赖，再由 producer 删除。若顺序反了，即使最终 schema 组合兼容，发布窗口中也可能失败。

我会把一次变更拆成版本状态：PROPOSED、VALIDATED、CANARY、DUAL_WRITE、DEFAULT、DEPRECATED、RETIRED。每次状态切换都有条件，例如消费者覆盖率 100%、影子对账差异为 0、解析错误低于阈值。它不是一条“审核通过”记录。

对于语义变化，最好新建字段而不是原地复用。例如保留 `amount_cent`，新增 `amount_decimal`，双写一段时间，让消费者迁移；确认旧字段无读取后再弃用。直接把 `amount` 的单位改掉，任何 schema 检查都救不了历史混读。

## 验证要使用历史数据和真实消费者

契约 CI 可以先做静态检查：字段删除、类型变化、union 顺序、default 合法性、枚举新增/删除、主键和分区列变化。Avro 还提供 alias，让 reader 将旧 type/field name 映射到新名称，但 alias 是否被具体语言实现和调用路径正确使用，也要跑数据验证。

我会从生产抽取脱敏的旧版本样本，用新 reader 反序列化；再用新 writer 生成边界值，让仍在线的旧 reader 读取。测试不仅看是否抛异常，还比较 default、null、decimal、timezone、枚举和嵌套字段结果。

语义变更则做双读或影子计算。新旧逻辑对同一批数据产出结果，按主键、分区和指标对账。允许差异的，要给出预期范围与原因；无法解释的差异不能靠“整体差不多”放行。

发布后继续观察解析错误、null rate、枚举 UNKNOWN、值域、行数、迟到率和下游任务失败。很多问题只在生产长尾值出现，canary consumer 与回滚开关要保留到观察窗口结束。

## 契约还要包含时效和运行责任

一张表 schema 完全没变，但从 8:00 产出变成 11:00，同样会破坏下游。契约应包含 freshness、completeness、更新频率、重跑与补数行为。Kafka topic 还要写 retention、ordering key、重复与投递语义。

质量阈值不能只写“非空率 99%”。要绑定窗口、分区和处理动作：哪个字段、哪个业务日期、样本量多大，超过阈值是阻断发布、隔离分区还是只告警。owner 也分 producer owner 与 data owner，前者处理管道故障，后者解释业务口径。

这些内容最好与 schema version 一起生成不可变 contract version。一次运行记录自己消费的 contract ID，排障时才能还原当时的字段和 SLA，而不是只看到今天已经修改过的文档。

数据契约不是一堵禁止变化的墙，更像一套有闸门的发布系统。机器检查把低级兼容错误挡在前面，消费者清单和影子验证处理真实影响，分阶段发布与监控保证变化可撤回。做到这些，业务才能放心变化，数据平台也不用靠事故来发现依赖。

## 对照源码与文档

- [Apache Avro 1.11.1 Specification：字段 default 的读取语义](https://github.com/apache/avro/blob/3a9e5a789b5165e0c8c4da799c387fdf84bfb75e/doc/content/en/docs/%2B%2Bversion%2B%2B/Specification/_index.md#L69-L97)
- [Apache Avro 1.11.1 Specification：writer schema、reader schema 与 Schema Resolution](https://github.com/apache/avro/blob/3a9e5a789b5165e0c8c4da799c387fdf84bfb75e/doc/content/en/docs/%2B%2Bversion%2B%2B/Specification/_index.md#L655-L680)
- [Apache Avro 1.11.1 Specification：数值类型提升与 enum/default 规则](https://github.com/apache/avro/blob/3a9e5a789b5165e0c8c4da799c387fdf84bfb75e/doc/content/en/docs/%2B%2Bversion%2B%2B/Specification/_index.md#L658-L694)
- [Apache Avro 1.11.1 Specification：type/field alias 在演进中的映射方式](https://github.com/apache/avro/blob/3a9e5a789b5165e0c8c4da799c387fdf84bfb75e/doc/content/en/docs/%2B%2Bversion%2B%2B/Specification/_index.md#L264-L275)
- [Apache Avro 1.11.1 Java Guide：读取时同时使用 writer 与 reader schema](https://github.com/apache/avro/blob/3a9e5a789b5165e0c8c4da799c387fdf84bfb75e/doc/content/en/docs/%2B%2Bversion%2B%2B/Getting%20started%20%28Java%29/_index.md#L176-L185)
