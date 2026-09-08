# 社区投稿与问题案例台账

整理日期：2026-09-08。来源：[《DeepSeek Harness：即插即用的实战指南》共建讨论 #1477](https://github.com/deepseek-ai/deepseek-harness/discussions/1477)。本次读取了 23 条主评论及其回复；聊天、入群信息和重复回复不计作实战投稿。

这是来源台账，不是插件认证单。下表保留投稿时的陈述；本书随后完成 Clippy 0.2.1 的界面与接口检查、Usage 0.2.5 的实际调用和统计排查，以及旧 tarball 引用的控制实验。Clippy 为部分通过，Usage 页面未通过，不能与作者报告混为一谈。具体结果见第 4、5、8、10 章。其余条目仍为待复核来源。

## 插件作者投稿

| 案例 | 投稿人及原帖 | 纳入章节 | 投稿内容与待验证点 |
| --- | --- | --- | --- |
| dsh-clippy 会话事件助手 | [sjh9714](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18024040) | 05、10 | 作者报告 rc.6 测试；从显示工具名称和任务状态入手，验证事件订阅及完成、失败分支 |
| dsh-usage 用量统计 | [kestiny18](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18024567) | 05、06、08、10 | 投稿版本 0.1.1；检查每轮、模型、会话统计，缓存和费用口径，与实际会话记录核对 |
| dsh-movein 配置迁移 | [sjh9714](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18024754) | 附录，待测 | 作者说明默认 dry-run，显式 apply 才写入；使用虚构配置样本检查迁移差异，不迁移个人真实凭据 |
| dsh-win32 Windows 兼容 | [sjh9714 首帖](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18027680)、[后续排查](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18039372) | 07 与附录 | terminal inspector、PTY、Git Bash、受限令牌与诊断命令；保留首帖和后续修订的时间关系，需要 Windows 环境复测 |
| pi2dsh 生态桥接 | [weijiafu14](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18033962) | 附录，待测 | 投稿版本 0.11.0；视觉、子代理、检索和记忆是不同场景，逐项记录，不以一次成功代替全部兼容 |
| dsh-model-memory 模型与记忆 | [Mutx163](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18107299) | 附录，待测 | 作者环境 Windows 11、DSH 0.1.1-rc.1 Web；验证自定义模型思考级别、跨会话和升级后的偏好保留 |

插件仓库与代码来源优先采用各投稿原帖提供的链接。安装前检查代码和生命周期脚本；不因为作者提供了安装命令就直接在日常环境执行。

## 可以展开讲排查过程的投稿

### 安装新插件，却被 pnpm store 冲突拦住

来源：[pbni-132，2026-09-05](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18305715)。纳入第 04、08 章。

投稿人报告安装 dsh-univer-office 时出现 `ERR_PNPM_UNEXPECTED_STORE`，并给出了临时目录与 home 目录树的对照。其分析指向上级 `pnpm-workspace.yaml` 和既有 `node_modules/.modules.yaml` 引入的 store 版本冲突。

本书要验证的是：安装目录看起来是新建的，为什么仍会受到上级工作区影响？实验应在隔离目录中布置两套对照，记录 pnpm 版本、发现的工作区和模块元数据。原帖中的 home 配置删除建议不能直接照搬到读者机器上。

投稿中的“DSH Desktop 0.7.2、migration protocol 4”暂按作者原文记录，发行项目身份尚待核对，不能与本机或官方 Harness 的版本号直接横向比较。

### 安装新插件，却报旧插件的临时包丢失

来源：[pbni-132，2026-09-06](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18311978)。纳入第 04、08 章。

投稿人报告历史依赖仍引用 `file:/tmp/dsh-super-injector.tgz`，后续安装 dsh-at-file 时触发 `ENOENT`。这适合解释“触发错误的操作”和“坏掉的依赖”为什么可能不是同一个插件。

本书已在隔离 profile 中直接构造失效的旧本地包引用：新安装触发 ENOENT，移除该实验坏依赖后安装成功。实际实验没有采用先安装再移走包的最初方案，也没有复制投稿人的完整桌面环境。第 4 章讲机制，第 8 章讲定位过程。

## 每日社区问题速报

已找到[纯粹发布的 2026-08-15 速报](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18031332)，其中包含以下九条线索。其他日期尚未完成归档，不能把这一天说成全部日报。

| 报错或现象 | 原始讨论 | 章节与排查方向 |
| --- | --- | --- |
| `prepare undefined`，随后出现工具调用不配对 | [#1697](https://github.com/deepseek-ai/deepseek-harness/discussions/1697) | 02、08：插件与宿主工具依赖、会话调用记录 |
| 自启动插件后 `Failed to load plugins` | [#1947](https://github.com/deepseek-ai/deepseek-harness/discussions/1947) | 02、08：客户端注入依赖与加载阶段 |
| Windows 目录选择 worker 提前退出 | [#1658](https://github.com/deepseek-ai/deepseek-harness/discussions/1658) | 07、10：原生目录选择与替代入口 |
| Windows minimal 模式找不到 `/bin/bash` | [#1856](https://github.com/deepseek-ai/deepseek-harness/discussions/1856) | 07、08：实际 Shell 路径与运行模式 |
| 内网 HTTP 中 `crypto.randomUUID` 不可用 | [#1919](https://github.com/deepseek-ai/deepseek-harness/discussions/1919) | 01、08：浏览器安全上下文与服务访问方式 |
| 模型请求 context length 400 | [#1930](https://github.com/deepseek-ai/deepseek-harness/discussions/1930) | 06、08：模型限制、实际请求长度和会话压缩 |
| MSYS2 启动静默退出，退出码 127 | [#1624](https://github.com/deepseek-ai/deepseek-harness/discussions/1624) | 07、08：终端环境和 Node 来源对照 |
| GLM 视觉输入被拒绝 | [#1765](https://github.com/deepseek-ai/deepseek-harness/discussions/1765) | 06、08：模型能力声明与视觉路由 |
| profile 的 JSON 解析出现 unexpected token | [#1903](https://github.com/deepseek-ai/deepseek-harness/discussions/1903) | 03、08：文件 BOM、编码与解析入口 |

上表来自速报的归纳，九个原始讨论及其后续修复尚需逐条核对。历史变通方法不直接作为当前版本的推荐配置。后续日报按“同一根因一个案例、日期追加观察”归档，避免把同一个问题反复写成新案例。

## 待核对的线索与约稿

| 来源 | 内容 | 当前处理 |
| --- | --- | --- |
| [纯粹：批处理插件线索](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18020669) | dsh-batch-pipeline，原讨论 #1553 | 候选第 04 章；原评论明确未本地实测 |
| [纯粹：Android 线索](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18021967) | Termux 适配，原讨论 #1588 | 候选第 10 章；需要对应平台 |
| [纯粹：编辑器集成线索](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18023036) | MCP、headless 与 pnpm 安装语法，原讨论 #1608 | 候选第 03、04 章；需核对版本 |
| [ylwl1997](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18087400) | dshbase 插件目录与收录渠道 | 作为发现来源；其验证标签不替代本书实测 |
| [PerryLink](https://github.com/deepseek-ai/deepseek-harness/discussions/1477#discussioncomment-18262105) | 愿意贡献插件质量、测试和供应链安全章节 | 候选第 10 章；这是投稿意向，尚不是已收到的成稿 |

## 入书与署名规则

每个案例保留投稿人、原评论永久链接、投稿日期及作者报告的环境；本书补充自己的实测日期、软件来源、提交或包版本和结果。状态依次记录为“线索待核对”“社区作者报告”“本书复现”“修复后复测”；无法复现、缺少平台和已过时也明确注明。

在正文中就近写明“该问题由某某报告”，附原帖，不把来源全部藏在书末。大段原文、作者截图和完整代码的转载要确认授权或许可证；默认采用简短归纳、链接和本书自行获得的实验截图。公开投稿不自动意味着所有附件可以任意再版。

兼容表必须分开记录宿主版本、插件版本、操作系统、Node 与包管理器版本、运行模式和具体测试项。一条场景通过不能变成“插件完全兼容”。
