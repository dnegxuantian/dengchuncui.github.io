# DeepSeek Harness：即插即用的实战指南

作者：邓明瑞（纯粹 / Chuncui）

状态：十章实测版 0.1 已合稿，可阅读与复现。第三方失败和未测范围明确保留；不等于所有社区插件通过兼容认证。

[打开完整阅读版](reader/index.html) · [EPUB](reader/deepseek-harness-guide.epub) · [验收记录](evidence/validation.md)

线上入口：[阅读全文](https://blog.chuncui.icu/deepseek-harness-book/)。原指南页已接入链接。线上文件与本地哈希核对结果见 `evidence/live-check.json`。

重建：从博客根目录执行 `node book/deepseek-harness/tools/build-reader.mjs`，需要 Node、npm、Pandoc。检查：`node book/deepseek-harness/tools/check-reader.mjs`。本地阅读服务：`node book/deepseek-harness/tools/serve-reader.mjs`，仅监听 127.0.0.1:56800，不暴露 runtime。

本书面向希望实际使用和扩展 DeepSeek Harness 的开发者。目录按 2026-09-08 讨论重新组织，不再沿用最初的资料分类。先完成一个任务，再沿着任务执行过程解释核心架构，继而学习插件使用、故障排查和插件交付。架构图使用 PlantUML；操作截图来自实际界面，不用生成图代替。

社区投稿和每日问题速报是章节案例的来源，收录索引见 [社区案例台账](community/cases.md)。投稿人的观察与本书复测结果分别记录。现有 `01-startup.md`、`02-first-request.md` 暂作实验记录，不代表正式章节已完成。

## 验证基线

- 实测日期：2026-09-08。
- 主机：macOS；Node v25.8.0。
- 已安装桌面版：0.1.1-rc.2，本地 Tauri 构建。
- 本地源码 HEAD：b150a551b8d465e31e418e1b2eaf5e79bbb7d28e；存在桌面壳与其他未提交改动，因此不是未修改的官方发行版。
- 桌面应用已经成功启动，实际进入 Web UI。
- CLI `web --help` 已运行成功。

## 章节与验收

| 章节 | 完成条件 | 状态 |
| --- | --- | --- |
| [01 安装与首个任务](chapters/01-first-task.md) | 官方包独立运行与读取 | 已写，已实测 |
| [02 核心架构](chapters/02-how-dsh-works.md) | 源码、真实事件、三张 PlantUML 图 | 已写；对照测试35/35 |
| [03 插件加载](chapters/03-plugin-loading.md) | Manifest、profile、加载与执行区别 | 已写，已实测 |
| [04 生命周期](chapters/04-plugin-lifecycle.md) | 升级、卸载、旧依赖故障 | 已写，已实测 |
| [05 社区插件](chapters/05-community-plugins.md) | Clippy、Usage | 已写，部分通过与失败均保留 |
| [06 模型对照](chapters/06-model-evaluation.md) | 两模型同题与解释错误 | 已写，各一次，不作排行 |
| [07 权限与环境](chapters/07-permissions.md) | 写入拒绝、Shell | 已写，macOS实测 |
| [08 故障分析](chapters/08-diagnosis.md) | 真实失败与社区问题分类 | 已写，Usage根因未最终定位 |
| [09 插件开发](chapters/09-build-plugin.md) | 完整源码、真实正常与坏输入 | 已写，修复版通过 |
| [10 质量与分发](chapters/10-release-quality.md) | 测试、打包、边界与许可证 | 已写，单测15/15 |

社区实测清单、日报索引和兼容表作为持续维护的附录。台账中候选案例不表示正文已经复现了这些功能；以对应章节的实际结果为准。

## 证据原则

截图只保留实验工作区，避免带出原有工作会话。成功响应不等同于文件正确，代码任务还要独立检查产物。没有操作过的功能只列为未验证，不写成作者亲历。新书页使用实际编写日期，指南发起日期单独记录。

每个正式案例要说明读者遇到了什么问题、如何操作、实际看到了什么，以及为什么会这样。修复建议必须有适用版本和验证范围。社区原图保留出处并确认转载条件；本书复测图单独标注。尚未取得的投稿、未复现的问题、历史版本的变通方法都不能写成已验证结论。
