---
title: "数据质量校验为什么必须绑定批次：一条 FAIL 不够定位问题"
date: "2022-01-26 18:12:34"
updated: "2022-01-26 18:12:34"
categories:
- "数据治理"
tags:
- "数据质量"
- "Great Expectations"
- "批次上下文"
description: "结合 Great Expectations 0.14.2 的 Batch、Expectation Suite、RunIdentifier 与 Validation Result，说明质量结果怎样绑定数据边界、规则版本和任务实例。"
cover: /images/articles/data-quality-batch-context.svg
top_img: /images/articles/data-quality-batch-context.svg
permalink: /2022/01/26/data-quality-batch-context/
comments: false
editorial_standard: expert-v1
---

数据质量平台发出一条告警：“订单表行数校验失败，实际 980 万，期望大于 1000 万。”收到的人通常还要追问：检查的是哪个分区，数据任务跑完了吗，规则什么时候改过，这次是补数还是正常调度？

如果这些信息不在结果里，一条 FAIL 只是现象。甚至同一条规则重跑后变成 PASS，也无法判断数据被修复了，还是第二次读取了另一批数据。

Great Expectations 0.14.2 把一次验证拆成 Batch、Expectation Suite、RunIdentifier、Validation Result 和后续 Action。这个结构很值得数据平台参考：规则不是悬空执行，结果也不能只保存布尔值。一次质量结论必须能回答“用哪版规则，在什么时候，对哪批数据，算出了什么”。

![数据质量结果需要绑定的批次上下文](/images/articles/data-quality-batch-context.svg)

<!-- more -->

## Batch 首先要有可复算的数据边界

“检查 `orders` 表”并没有指定一批数据。分区表要明确 `dt=2022-01-25`，Iceberg 表可以指定 snapshot ID，Kafka 数据要有每个 partition 的 offset 范围，数据库查询则需要可重复读取的 cutoff 或版本。

只保存校验开始时间不够。质量任务 01:10 开始、01:20 结束，生产任务可能在 01:15 覆盖目标分区；不同规则并发执行时，读到的甚至不是同一版本。最终聚合出“一张表 8 条规则，6 条通过”，实际每条规则检查的输入可能不同。

我会让质量任务先解析并冻结 batch definition，再执行所有规则：

```text
asset: warehouse.dwd_orders
partition: dt=2022-01-25
data_version: hdfs_path_commit=...
producer_instance_id: ...
producer_attempt_id: 2
```

若存储支持 snapshot，就直接使用不可变 snapshot ID。普通 Hive 分区至少要在生产任务原子提交后再触发质量检查，并记录文件清单摘要或提交标记。检查过程中分区仍可写，结论就不具备复算性。

Great Expectations 的 Checkpoint 配置要求每个 validation 指定 `batch_request` 和 `expectation_suite_name`，正是把“数据是什么”和“规则是什么”放在同一次验证中。平台不必照搬产品名，但这两个维度不能省。

## 规则也有版本，名字相同不代表口径相同

规则 `orders_row_count` 今天可能要求大于 1000 万，下周因业务变化调成 900 万。如果结果只关联规则 ID，查看历史失败时会显示当前阈值，用户会以为当时应该通过。

规则发布时需要生成不可变版本，保存 expectation type、参数、过滤条件、严重级别、适用范围和代码/UDF 版本。运行实例引用具体版本，不能引用一条会被原地修改的 current record。

以下变更都应该产生新版本：

- 阈值从固定值改为环比区间；
- null 检查增加过滤条件；
- 唯一键从 `order_id` 改成组合键；
- SQL 或 UDF 实现变化；
- failure 从告警升级为阻断下游。

Great Expectations 的 Checkpoint 带 `config_version`，Expectation Suite 也作为 validation 的明确输入；Checkpoint 配置可以进入版本控制。工程上还应保存实际展开后的运行配置，因为 YAML 模板、环境变量和运行参数合并后，最终规则可能与仓库文件不同。

我会对展开后的规则集合做 hash。重跑时若 batch 一样、rule set hash 不同，页面明确标注“使用新规则重验”，不能拿新结果覆盖旧结果。

## RunIdentifier 需要接上调度实例

Great Expectations 0.14.2 的 `RunIdentifier` 用 `run_name` 和 `run_time` 标识一组 validations，并统一把时间转成 UTC。这能区分多次运行，但在企业调度平台里，我还会加入 `schedule_instance_id` 与 `attempt_id`。

同一个业务日期可能正常跑一次、失败重试两次、人工补数一次。它们检查的 partition 名相同，数据版本和规则版本可能不同。只用 `2022-01-25` 做 run name 会合并四次证据。

一次 validation run 应至少保存：

```text
validation_run_id
schedule_instance_id / attempt_id
checkpoint_name / config_version
batch_definition / data_version
expectation_suite / rule_set_hash
started_at / ended_at
engine_execution_id
```

运行失败还要区分“规则执行异常”和“数据未通过”。SQL 语法错误、连接超时、权限不足时，规则没有产生有效判断，状态应该是 ERROR 或 UNKNOWN；把它记成 FAIL，会误导用户以为数据已经被检查且不合格。

## Validation Result 要保留观察值和异常上下文

Great Expectations 的单条 `ExpectationValidationResult` 包含 `success`、expectation config、result、meta 和 exception info；Suite 级结果再汇总 results、statistics 和 meta。这个模型比单一布尔值更接近排障需要。

对于行数规则，至少保存 observed value、阈值、查询或指标定义、扫描行数、耗时和异常信息。唯一性规则要保存重复数与有限样本，但不能把所有异常主键塞进结果；完整问题数据可以写到受权限控制的隔离表，结果里放引用。

采样也要说明方法。随机抽 100 条没有发现 null，不能显示成“全表 null 校验通过”。结果应标注 full scan、partition scan、sample，以及 sample size 和采样策略。

Meta 字段适合补充平台上下文，但字段名称要标准化。每个团队自由写 `jobId`、`task_id`、`instance`，后续查询无法统一关联。核心身份与数据版本最好进入固定 schema，扩展信息才放 meta。

结果存储应追加，不覆盖。Great Expectations CheckpointResult 的 `run_results` 以 ValidationResultIdentifier 为 key，保存 validation result 与 action result；平台同样要让每次 attempt 都留下独立记录，告警、阻断、写隔离区等 action 也保存结果。

## 阈值需要批次上下文，不能只看历史均值

动态阈值常用过去 7 天均值上下浮动 20%。如果把补数批次、节假日和正常日批混在一起，基线本身就失真。规则计算历史区间时，也要记录用了哪些 batch 和统计版本。

我通常把上下文分成几个维度：调度类型（正常/补数/重跑）、业务日类型、上游是否完整、分区粒度和数据版本。一个补跑三天数据的任务，不应该套用单日行数阈值；小时分区与日分区也不能共享同一个波动比例。

动态阈值的输出最好包括：

```text
observed=9,800,000
expected_range=[9,650,000, 10,450,000]
baseline_batches=[...]
algorithm_version=v3
excluded_batches=[holiday, backfill]
```

这样规则今天突然变宽时，可以追查是数据变化，还是基线样本与算法变了。只保存最终上下限，无法复算。

## 质量结果要控制下游，但必须有状态机

并非所有失败都应该阻断。核心主键重复可以标为 ERROR，禁止发布；字段描述缺失可能只是 WARNING；质量引擎自身不可用则是 UNKNOWN，是否阻断取决于数据等级和 fail-open/fail-closed 策略。

我会把生产与校验组织成明确状态：数据提交完成后进入 `PENDING_VALIDATION`，规则执行得到 `PASSED`、`FAILED` 或 `UNKNOWN`，再由策略决定 `PUBLISHED`、`QUARANTINED` 或等待人工确认。不要让下游只监听“生产任务 SUCCESS”，绕过质量结果。

人工放行必须保存操作者、理由、影响范围和到期时间。一次临时放行不能把规则永久关闭；下次 batch 仍按原策略执行。修复后重验则创建新的 validation attempt，保留第一次失败证据。

最终，一个可用的数据质量结论应能从告警链接一路看到：哪次生产实例提交了哪个数据版本，哪版规则对它执行，实际观察值与样本是什么，失败触发了什么 action，后来又用什么条件重验。做到这一步，PASS/FAIL 才是证据的摘要，而不是全部证据。

## 对照源码与文档

- [Great Expectations 0.14.2 Checkpoint：Batch、Expectation Suite、Validation Result 与 Action](https://github.com/great-expectations/great_expectations/blob/8afe1540b4e5f7fdeacff02af8a0c8a8dc30b2dc/docs/reference/checkpoints_and_actions.md#L16-L30)
- [Great Expectations 0.14.2 Checkpoint 配置：batch_request、suite 与 config version](https://github.com/great-expectations/great_expectations/blob/8afe1540b4e5f7fdeacff02af8a0c8a8dc30b2dc/docs/reference/checkpoints_and_actions.md#L42-L78)
- [`RunIdentifier`：用 run_name 与 UTC run_time 标识一组验证](https://github.com/great-expectations/great_expectations/blob/8afe1540b4e5f7fdeacff02af8a0c8a8dc30b2dc/great_expectations/core/run_identifier.py#L11-L67)
- [`ExpectationValidationResult`：success、result、meta 与 exception_info](https://github.com/great-expectations/great_expectations/blob/8afe1540b4e5f7fdeacff02af8a0c8a8dc30b2dc/great_expectations/core/expectation_validation_result.py#L40-L66)
- [`ExpectationSuiteValidationResult`：规则明细、statistics 与 meta](https://github.com/great-expectations/great_expectations/blob/8afe1540b4e5f7fdeacff02af8a0c8a8dc30b2dc/great_expectations/core/expectation_validation_result.py#L273-L314)
- [`CheckpointResult`：按 ValidationResultIdentifier 保存验证与 action 结果](https://github.com/great-expectations/great_expectations/blob/8afe1540b4e5f7fdeacff02af8a0c8a8dc30b2dc/great_expectations/checkpoint/types/checkpoint_result.py#L26-L52)
