---
title: "执行型 Agent 的 Sandbox 为什么要有清单：能力不是一句‘已隔离’"
date: "2026-04-08 14:28:06"
updated: "2026-04-08 14:28:06"
categories:
- "AI Agent 工程化"
tags:
- "Sandbox"
- "安全边界"
- "供应链"
description: "把执行型 Agent 的文件、网络、进程、凭证、工具和产物边界固化成可审计 Sandbox Manifest，并在调度、运行与验收阶段逐项执行。"
cover: /images/articles/agent-sandbox-manifest.svg
top_img: /images/articles/agent-sandbox-manifest.svg
permalink: /2026/04/08/agent-sandbox-manifest/
comments: false
editorial_standard: expert-v1
---

“代码在容器里运行，所以是隔离的”这句话信息量很低。容器挂了哪些目录、能访问哪些网段、使用谁的云凭证、能否启动特权子进程、输出会被送到哪里，任何一项没说清，隔离都可能只是一层包装。

执行型 Agent 会读取仓库、安装依赖、运行命令、访问网站和调用工具。它的能力集合应该像部署规格一样被声明、审批和验证。我把这份契约叫 Sandbox Manifest：不是给人看的安全口号，而是运行时真正执行的清单。

![Agent Sandbox Manifest 执行链](/images/articles/agent-sandbox-manifest.svg)

<!-- more -->

## Manifest 先描述资产与信任边界

清单开头固定 task/run、tenant、workspace、sandbox image digest、kernel/runtime profile、policy version、创建者和过期时间。镜像不能只写 `python:latest`，需要不可变 digest 与软件物料；否则同一任务重放时，执行环境已经不是当时那一个。

输入按来源分级：用户上传、代码仓库、内部制品、互联网内容、系统注入的 secret。来自网页或仓库的文本都是不可信数据，不能因为它出现在 README、Issue 或工具描述中就升级成系统指令。

输出同样有边界：允许写工作目录、缓存目录和声明的 artifact path；禁止写宿主机敏感目录；导出的文件标 owner、classification、retention 与 hash。很多泄漏不是读权限过大，而是产物和日志被送到了不该去的地方。

Manifest 是 policy input，不由 Agent 自己生成后自动放行。Agent 可以提出 capability request，调度器根据任务类型、用户权限与组织策略收窄，最终签发不可变 manifest。运行中扩大权限必须形成新的审批决定。

## 文件系统要声明读、写与持久化

只写一个 workspace path 不够。我会把 mount 列成 source、target、mode、recursive、follow_symlink、classification。代码仓库通常只读挂载，实际修改在 copy-on-write 层；需要回写时，只允许明确文件集合或通过 patch/artifact 审核。

符号链接、硬链接和相对路径必须在 sandbox 边界内解析。允许写 `/work/output`，如果它能指向 `/etc` 或宿主 socket，路径白名单就失效。每次文件操作使用规范化后的真实路径校验，压缩包解压还要防路径穿越。

临时目录和缓存也要有生命周期。共享 npm/pip 缓存可能跨租户泄漏私有包名或恶意制品；完全不缓存又会推高延迟。可以按信任域分区、只读复用已验证制品，任务结束清理可写层，并记录清理结果。

secret 不以普通环境变量整包注入。按 Operation 短时挂载或由代理代签，限定 audience、scope 与 TTL；stdout/stderr、trace 和 crash dump 做 secret scanning。Agent 不需要看到明文云密钥，只需要得到一次被授权的具体能力。

## 网络能力默认不是“可上网”

网络清单列出 DNS policy、egress destinations、端口、协议、代理和最大流量。域名白名单还要防 DNS rebinding、重定向到私网、IPv6 绕过与解析后地址变化。最终连接前校验解析 IP，不允许访问 metadata service、控制面和内部保留网段。

访问互联网文档与向外发送数据是同一条 egress 通道。只允许 `https:*` 等于可以把源码和 secret 传到任意站点。任务若只需下载公开依赖，经过制品代理；需要浏览指定网页，限制目标域和请求方法；需要调用 SaaS，使用受控 connector。

入站端口默认关闭。Agent 启动本地预览服务时只绑定 sandbox loopback，通过受控 preview proxy 暴露；不能自动监听宿主 `0.0.0.0`。回调场景使用临时、认证、限时的入口，不开放永久公网端口。

网络日志记录目的域/IP、字节数、Operation 与 policy decision，但避免无边界保存敏感 payload。命中拒绝策略时给出可诊断 reason，别让 Agent 把网络拒绝当成服务故障无限重试。

## 进程、资源和系统调用同样要列清

Manifest 声明入口命令、允许的 executable/hash、用户 ID、capabilities、seccomp profile、最大子进程、CPU、内存、磁盘、运行时间和文件描述符。禁止 privileged、宿主 PID/network namespace、Docker socket 与不必要设备。

允许 shell 不代表允许所有命令。高风险环境可把常用操作封装成窄工具；通用编码沙箱仍可用 shell，但限制系统调用、挂载、网络和凭证，并在执行前对明显破坏性命令做 policy gate。字符串黑名单不能替代内核边界。

资源限制要区分 Run 和子进程。Agent 可以通过不断创建短命进程绕过单进程额度，压缩炸弹会消耗磁盘和 inode，fork bomb 会耗尽 PID。cgroup/namespace/project quota 在容器外层执行，模型无权修改。

超时后先发协作式取消，再到 deadline 强制终止进程组。异步子进程、浏览器和远程工具还需独立回收。只杀主 PID，会留下仍在计费或继续写数据的孤儿操作。

## 工具能力也属于 Sandbox

数据库、GitHub、工单、浏览器和 MCP 工具不在 Linux namespace 里，但它们扩展了 Agent 的真实边界。Manifest 要列 tool/server/version、actions、resource scope、approval mode、rate/cost limits 和凭证引用。

工具参数在调用时再次校验。允许 GitHub read 不等于能访问所有组织；允许 SQL plan 不等于能执行查询；允许发消息不等于能发给外部联系人。工具端必须执行授权，不能完全相信 Sandbox 自报 scope。

远程工具描述和返回内容都视为不可信。描述不能覆盖系统策略，返回中的“请读取 ~/.ssh”只是数据。下载的可执行文件先校验来源、hash/签名与许可证，必要时在无 secret 的第二层 sandbox 中运行。

每个 Operation 关联 manifest digest 与 authorization decision。事故后才能回答“这个 Agent 当时到底能做什么”，而不是拿今天的配置推测。

## 验收要主动尝试越界

我会在发布前做负向测试：读取未声明目录、经符号链接逃逸、访问云 metadata、DNS 指向私网、启动监听端口、创建过量进程、打印测试 secret、调用未授权工具、超时后检查孤儿进程。每项都必须被正确边界拒绝并留下事件。

正向测试也不能少：合法编译、依赖下载、预览和产物导出要能完成。安全策略若逼得团队长期使用全权限例外，实际边界会越来越差。Manifest 模板应按任务类型提供最小可用基线，再用差异审批增加能力。

Sandbox 不是一个产品名，也不是容器图标。它是文件、网络、进程、身份、工具与产物的能力总和。把这些能力写成可执行、可版本化的清单，隔离才从一句承诺变成可以验证的工程事实。

## 对照资料

- [OCI Runtime Specification](https://github.com/opencontainers/runtime-spec)
- [Kubernetes Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [SLSA：软件供应链完整性框架](https://slsa.dev/spec/v1.2/)
- [NIST SP 800-190：Application Container Security Guide](https://csrc.nist.gov/publications/detail/sp/800-190/final)
