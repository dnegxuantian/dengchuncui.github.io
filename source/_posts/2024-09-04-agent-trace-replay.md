---
title: "Agent Trace 怎么回放：复现决策，不重复生产副作用"
date: "2024-09-04 10:42:18"
updated: "2024-09-04 10:42:18"
categories:
- "AI Agent 工程化"
tags:
- "Trace Replay"
- "Agent 可观测性"
- "回归验证"
description: "把 Agent 回放拆成协议、组件和受控在线三层，用不可变 manifest 固定输入与版本，对模型、工具和副作用采用不同策略，生成可归因的差异报告。"
cover: /images/articles/agent-trace-replay.svg
top_img: /images/articles/agent-trace-replay.svg
permalink: /2024/09/04/agent-trace-replay/
comments: false
editorial_standard: expert-v1
---

Agent 出问题后，常见做法是把用户问题再问一次。第二次可能用了新模型、新索引和变化后的工具状态，即使答对，也不能证明原问题修复；如果工具有副作用，直接重跑还可能再次发送、创建或修改。

我把 Trace Replay 分成三层：先用原始事件回放协议转换和状态归并，再用固定检索/工具 fixture 回放编排，最后才在隔离环境调用新模型或新索引。每层回答不同问题，且生产副作用默认不重演。

![Agent Trace 的三层回放](/images/articles/agent-trace-replay.svg)

<!-- more -->

## Replay Manifest 先冻结现场

一次可回放 Run 不只需要 messages。manifest 至少引用 Bundle、model snapshot、route policy、tool registry/schema、index/knowledge snapshot、policy version、用户权限测试身份、原生流事件和工具 artifacts。

artifact 使用内容 hash 和不可变地址。数据库“当前状态”会变化，回放应保存当时读取的对象 snapshot 或 mock response；只记一个 object ID，几天后拿到的是另一个 version。

敏感 payload 加密并受访问审批，常规回放使用脱敏 fixture。manifest 可验证各 artifact hash，避免有人修改测试输入后仍声称在复现同一次故障。

预期不一定是完整答案文本。更稳定的是不变量：不得重复调用工具、最终状态应 incomplete、必须引用某 source、对象 ID 应为 X、越权请求必须拒绝。文本有随机性，业务与安全边界必须确定。

## L1 纯协议回放定位适配器问题

第一层不调用模型和工具。把线上保存的 provider raw response/body/SSE bytes 重新送入 adapter、event reducer 和 finalizer，比较旧版与修复版输出。

它适合验证中文 UTF-8 跨 chunk、多个 SSE event 同 chunk、function arguments 分片、未知 finish reason、200 后断流、usage 晚到等问题。对原始字节随机重新分片，归并结果必须相同。

L1 应该快速、确定，可在 CI 全量跑。若修复“缺最后一段文本”，同一 raw events 在新版应得到完整结果，同时其他 fixtures 不改变终态。无需再次付模型费用，也不受模型输出变化影响。

只保存最终文本就做不了这层。可观测设计必须保留足够的原生事件结构和序列，哪怕正文因合规只保存加密 payload。

## L2 组件回放定位编排与状态

第二层运行真实 Agent orchestrator，但 retrieval、model 和 tools 使用固定 fixtures。输入相同，外部响应按 manifest 返回，可测试分支、重试、权限、状态机和最终化。

工具 fixture 不只返回 success。超时但已有 operation ID、200-malformed、STATE_CONFLICT、迟到回调、需要确认都要保留真实形态。模型 fixture 可按 attempt 返回指定事件序列，验证 fallback 是否重复执行已成功工具。

虚拟时钟控制 timeout、backoff、approval expiry 和 deadline。测试不真的等 30 分钟，也不依赖机器时间。随机 ID 使用可注入生成器，方便断言事件关系。

组件回放结束输出完整 state/event log，与预期 transition invariants 比较。只断言最终 status，可能漏掉中间重复操作后来被覆盖。

## L3 在线重演验证新模型与新知识

要验证 Prompt/model/index 改动时，才进入第三层。真实调用创建新的 replay run/attempt，关联原 Run，但不修改原历史。固定其余变量，一次只换目标组件。

副作用工具替换为 dry-run/sandbox，或只查询原 operation 状态。创建、发送、删除类工具绝不因为“回放”直接调用生产。若必须验证真实集成，使用专用测试资源和可清理 namespace，并经过明确审批。

外部数据无法冻结时，报告标出 drift。比如索引已更新，只能比较新知识下的行为，不声称复现当时 retrieval；模型供应商无法调用旧 snapshot，也要标 model changed。

在线重演重复多次，比较通过率、tool path、tokens、latency 与成本分布。一次成功只能证明有可能答对，不证明退化消失。

## 差异报告要沿事件对齐

旧、新 Run 按逻辑节点对齐：context built、model attempt、tool proposal、policy decision、operation result、final claims。仅做最终文本 diff，会把关键的工具路径变化藏掉。

事件 diff 展示新增/删除/改变的工具调用、参数 hash、对象、状态、引用和 finish reason。自然语言使用事实 claim diff，而不是逐字符 diff。成本与延迟按 span 比较。

找不到对应节点时也有意义。新版少了一次无用检索是优化；少了权限检查是严重回归。节点有类型与风险标签，报告按风险排序。

修复验证要求原失败不变量通过、邻近用例不退化、守门集通过。只有 replay case 通过可能是对单个输入过拟合。

## 回放系统本身需要隔离

生产 trace 中的凭据、审批 token 和 signed URLs 在采集时就不应保存，回放用专用身份重新授权。原 token 即使未过期也禁止使用。

网络默认 deny，只允许声明的 mock 或 sandbox endpoint。回放任务有 CPU/token/cost 配额，防一个故障 trace 进入无限 Agent loop。输出标 `replay=true`，不写回生产会话、memory 或业务数据库。

回放人员的权限与原用户权限分开。为了复现某用户看到的过滤结果，使用合成 policy snapshot，不给调试者直接扩大生产访问。所有 artifact 解密和在线重演都进入审计。

Agent Trace Replay 的核心不是“再跑一遍”，而是按问题选择最小重放层。协议 bug 用原事件确定重放，编排 bug 用 fixtures，模型行为再做受控在线实验。这样既能复现决定，又不会把调查变成第二次生产操作。

## 对照规范与资料

- [OpenTelemetry Trace：Span、Event、Link 与状态](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [W3C Trace Context：跨服务关联 Trace](https://www.w3.org/TR/trace-context/)
- [Git Objects：用内容寻址保存不可变 artifact](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [OpenAI Evals：基于固定样本与 grader 的回归](https://github.com/openai/evals)
