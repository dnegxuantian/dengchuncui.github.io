---
title: "多 Agent 并发为什么要控制共享状态：分工不等于可以同时乱写"
date: "2026-06-26 08:20:43"
updated: "2026-06-26 08:20:43"
categories:
- "AI Agent 工程化"
tags:
- "Multi-Agent"
- "并发控制"
- "共享状态"
description: "从任务所有权、artifact 版本、乐观并发、合并策略和副作用串行化设计多 Agent 协作，避免并行执行产生覆盖、重复操作与错误完成。"
cover: /images/articles/multi-agent-shared-state.svg
top_img: /images/articles/multi-agent-shared-state.svg
permalink: /2026/06/26/multi-agent-shared-state/
comments: false
editorial_standard: expert-v1
---

把一个任务拆给多个 Agent，吞吐量看起来会立刻提升。真正跑到共享仓库、文档或业务系统时，问题也随之出现：两个 Agent 同时改同一文件，研究 Agent 更新了结论，写作 Agent 还在引用旧证据，两个执行 Agent 重复提交同一工单。

多 Agent 首先是并发系统，其次才是角色设计。分工名称并不会自动提供隔离、一致性和幂等。共享状态必须有 owner、版本和合并语义，外部副作用必须回到单一的授权与提交边界。

![多 Agent 共享状态控制](/images/articles/multi-agent-shared-state.svg)

<!-- more -->

## 先画出哪些状态真的共享

我会把协作状态分成四类：任务图与分配、证据和中间 artifact、共享工作区文件、外部系统副作用。它们的并发策略不同，不能统一塞进一段 group chat。

任务图由协调器维护，worker 领取带 lease 的 task node；证据 artifact 采用不可变版本，消费者引用具体 version；代码文件可用分支/patch 隔离再合并；外部副作用通过 operation registry 去重并串行审批。

消息只是通知，不是权威状态。Agent 说“我完成了”不代表 artifact 已提交，协调器要看到 task transition 的 compare-and-set 与验收结果。Agent 消息丢失或重复，不应改变最终任务状态。

每个共享对象定义 source of truth、写入者、读一致性、版本字段、冲突处理和保留期。没有这张表，团队往往一边把数据库当事实，一边又让最新聊天消息覆盖它。

## Task Ownership 用 Lease 而不是口头认领

节点从 ready 进入 leased/running，带 worker、lease version 与 expiry。Worker 定期续租；超时后协调器可以重新分配，但旧 worker 的迟到结果不能直接提交，必须携带仍有效的 lease token 做条件写。

Exactly-once worker 执行很难保证，平台按 at-least-once 设计。任务逻辑需要幂等，或把结果写成新 artifact 再由协调器选择。两个 worker 因网络分区都执行完，最终只接受符合当前 lease/version 的提交，另一个标 superseded。

依赖节点引用上游 artifact version，而不是“任务 A 的最新结果”。上游修订后，协调器决定使哪些下游 stale、重跑或继续。让下游自动读取 latest，会在一次运行中混入不同版本的世界。

取消也通过状态机传播。父任务取消后，停止派发，撤销 leases；已发生的 Operation 单独跟踪。不能因为聊天里发了一句 stop，就假设所有 worker 和远程工具已停止。

## Artifact 尽量不可变，修改用新版本

研究资料、计划、代码 patch、评审意见和测试报告都写成 artifact，包含 producer、input versions、schema、content hash 与 created time。修改创建新 version，并用 supersedes/derived-from 表达关系。

多个 Agent 对同一事实给出不同结论时，不让最后写入者覆盖。保留两份 evidence 与 claim，由聚合者比较来源和适用范围，产生 accepted/rejected/unresolved decision。未决冲突不能在最终报告里悄悄选一边。

大型文档可按 section ownership 分区，但标题、术语表、结论摘要仍是共享热点。分配单写 owner，其他 Agent 提 patch/comment；合并时验证 base version。简单的 markdown 文本也需要乐观锁，否则评审意见可能打在已经消失的段落上。

结构化数据优先用领域级合并，不用文本三方合并猜语义。比如 sources 按 canonical URL 去重，事实按 claim ID 合并，测试结果按 case/version 追加。CRDT 适合部分协作字段，却不能自动解决“两个结论哪个正确”。

## 工作区写入需要隔离和合并门

代码任务让每个 Agent 使用独立 worktree/branch 或 copy-on-write workspace。它们可以同时读相同基线，写自己的 patch；合并由明确 owner 串行执行，检查用户原有改动、冲突、测试和安全扫描。

共享同一目录时至少使用文件范围锁和 base hash。Agent 写前声明 write set，提交时 compare；发现文件已变就重新读取并重做 patch。不要用 `git reset`、强制覆盖或“以我版本为准”解决并发。

构建产物、依赖缓存与临时文件按 worker 隔离。两个 Agent 同时覆盖 `dist/`、锁文件或测试数据库，可能让验证结果互相污染。缓存可共享只读内容寻址对象，可写状态按 Run 分区。

合并成功不等于任务成功。集成基线再跑整体构建、接口测试与语义验收；并行分支各自通过，只说明局部世界成立。

## 外部副作用要经过统一 Operation Registry

发消息、创建 MR、提交任务、改 DNS 或写数据库，不能由多个 worker 看到相同意图就各自执行。协调器为逻辑操作生成 operation key，记录规范化对象、参数、权限与状态；工具网关只接受当前 owner 的提交。

Agent 可以并行准备方案和验证证据，高风险 commit 串行化。审批绑定 operation version；参数改变后重新审批。重复请求返回原结果，状态未知先向外部系统核对，不创建第二个操作。

不同副作用若相互独立可并行，但要显式声明 conflict key，例如 tenant+resource、repository+branch、table+partition。调度器对相同 key 排序，比让语言模型猜“应该不会冲突”可靠。

人工也是共享状态参与者。人在页面改了文件或关闭工单，Agent 下一次提交必须看到 version change；不能把人的动作当异常覆盖掉。

## 并行收益要扣掉协调成本

指标不能只看 worker 数和总耗时。还要看 stale work ratio、lease reassignment、merge conflict、duplicate operation、artifact invalidation、协调 token 与人工解决冲突时间。任务拆得越碎，交接和上下文复制越贵。

只有能独立产出且合并规则清楚的子任务适合并行：不同资料源研究、互不相交模块检查、独立测试。单一文件连续改写、强顺序诊断和同一生产对象操作，串行往往更快。

测试要注入 worker 超时后复活、重复消息、artifact 迟到、合并时用户改动、两个 Operation 同时提交。验收最终 source of truth，而不是协调器日志看起来有序。

多 Agent 的可靠性来自受控共享，而不是更多角色标签。把任务所有权、artifact 版本、工作区隔离和副作用提交分别管住，才有资格享受并行带来的速度；否则只是让竞态也具备了自然语言能力。

## 对照资料

- [Martin Kleppmann：Designing Data-Intensive Applications 相关资料](https://dataintensive.net/)
- [Git Documentation：gitworkflows](https://git-scm.com/docs/gitworkflows)
- [Temporal：Workflow Execution](https://docs.temporal.io/workflow-execution)
- [OpenTelemetry Trace API：Links 与并发工作关联](https://opentelemetry.io/docs/specs/otel/trace/api/)
