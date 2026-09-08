# 本版实验与验收

实验日期 2026-09-08，macOS，Node v25.8.0，pnpm10.32.1。源码提交 b150a551b8d465e31e418e1b2eaf5e79bbb7d28e；本地构建存在其他改动，另以官方 npm 0.1.1-rc.2 独立完成读取。

## 实际结果

| 项目 | 结果与边界 |
| --- | --- |
| 官方包安装、Web 启动、模型读取 | 通过；官方独立会话包含 glob/read 成功 |
| 基线读取与只读写入拒绝 | 通过；独立验算 3/30/10，拒绝文件未出现 |
| 原创插件首次调用 | 0.1.0 失败，错误使用 FsTarget 接口 |
| 原创插件修复调用 | 0.1.1 成功，返回 P95=12；字符串坏输入拒绝 |
| 原创插件单测 | 15/15 通过 |
| scoped + invariant | 原配置21/35；独立 TypeScript 优先配置35/35 |
| 安装旧路径故障与恢复 | 构造旧 tarball 引用触发 ENOENT，移除实验坏依赖后成功 |
| 卸载 | 独立 home 依赖与配置中示例节点消失 |
| 模型小样本对照 | Flash/Pro各一次；数值通过，解释均有越界 |
| Shell | pwd、node --version 两次实际调用成功 |
| Clippy | 界面与状态 HTTP200；完整状态转换未测 |
| Usage | 实际9471输入/80输出，页面为空；纯投影同日志计数正确 |

## 可以重新运行的检查

从博客根目录运行：

```sh
node --test book/deepseek-harness/examples/job-summary/stats.test.js
node book/deepseek-harness/tools/collect-evidence.mjs
node book/deepseek-harness/tools/build-reader.mjs
```

事件采集需要本机保留的私有 runtime 与 zstd。分发版不包含原始会话，因此不能凭空重建旧事件；其中提供的是脱敏摘要。读者可以用自己的隔离任务建立新日志。

宿主测试从本机 Harness 仓库执行，配置内含该实验机的绝对路径：

```sh
pnpm exec vitest run --config /Users/rui/Documents/ChatGPT/blog/book/deepseek-harness/tools/vitest-source-only.config.mts packages/core/tools/tests/scoped.spec.ts packages/core/agent-loop/tests/invariant.spec.ts
```

配置只改变扩展名解析优先级，不修改宿主源码；迁移到其他机器需要调整路径。它用于复核本地混合产物问题，不建议无条件替换官方测试配置。

## 未解决与未覆盖

Usage 页面连接环节未定位最终根因。Clippy 完整动态状态、Windows/Android、所有社区插件、长期压测、跨宿主升级、完整沙箱审计均未完成。社区日报当前归档一份，其他日期不冒充已纳入。

这不会把相应插件标为通过；也没有为了消除失败去修改第三方实现。书稿与测试源码可阅读、可复现，第三方问题保留为明确的实验结果。
