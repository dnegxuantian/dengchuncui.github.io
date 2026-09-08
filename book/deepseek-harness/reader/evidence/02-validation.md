# 第 2 章验证记录

日期：2026-09-08。源码基线：b150a551b8d465e31e418e1b2eaf5e79bbb7d28e。环境为已有本地构建，不是官方干净发行安装。

## 已执行

1. 在独立 DSH_HOME 的 Web UI 中发送真实模型请求。界面模型为 DeepSeek-V4-Flash / High，Read Only。第二轮使用 glob、read，得出 3、30、10；持久事件中存在工具调用、内容和成功结果。
2. 第三轮尝试 write 专用实验文件，界面返回文件沙箱 read-only 拒绝。未接受升级权限建议，没有重试或改用 Shell。文件存在性以事件提取脚本独立检查为准。
3. 对同一隔离 DSH_HOME 执行配置输出：

```sh
DSH_HOME=/Users/rui/Documents/ChatGPT/blog/book/deepseek-harness/runtime node /Users/rui/project/github/deepseek-harness/apps/cli/lib/bin.js --profile web --dump-config
```

确认输出含基础 Bundle / Web Bundle 来源，含 tool-fs、tool-fs-search、session-persistence-jsonl。未公开原始完整配置。

4. 在 Harness 源码根目录运行：

```sh
pnpm exec vitest run packages/core/tools/tests/scoped.spec.ts packages/core/agent-loop/tests/invariant.spec.ts
```

退出码 1；两个文件，35 项测试，21 项通过、14 项失败。

- `agent-loop/tests/invariant.spec.ts`：8 项通过。
- `tools/tests/scoped.spec.ts`：27 项中 13 项通过、14 项失败。
- 代表失败：本应只返回 `shared` 的工具列表多出 `mine`；另一个作用域的执行被 scoped veto 拦截。
- 失败原因尚未定位。未修改 Harness 源码、未清理构建产物，也没有将失败归因为官方漏洞。

5. 直接检查本章主要引用的 profile.ts、tools/index.ts、agent.ts、session/index.ts：相对本地 HEAD 没有 tracked 差异。整个工作区仍有其他改动，这不证明运行产物全部对应 HEAD。

## 事件摘要再生成

```sh
node book/deepseek-harness/tools/summarize-session.mjs book/deepseek-harness/runtime/sessions/--Users-rui-Documents-ChatGPT-blog-book-deepseek-harness-lab--/session-fbf77977-22b8-4fed-8af9-21b6d46a4f2c/session.jsonl.zstd
```

使用 zstd CLI 解码连续帧，不把仅解出第一帧的结果当完整日志。提取脚本只打印允许的结构字段及独立验算，不复制原始会话。

## 后续对照

仅使用书稿目录的 `tools/vitest-source-only.config.mts` 优先解析 TypeScript，运行原两组测试，35/35 通过。2026-09-08 12:45 再运行仍为 35/35，退出码0。未删除构建文件，未修改宿主源码。结果支持本地解析混用方向，没有完整加载图，不能宣称逐一证明了模块重复来源。

## 未覆盖，不计为通过

生产多 Agent 隔离；插件加载缺依赖实验；waterfall 截断实验；默认循环替换；远程能力实现；模型 HTTP 请求抓包比对；完整沙箱审计。

截图是本机真实 UI；图解由 PlantUML 源文件渲染，两者不混用。原始会话与凭据留在 Git 忽略范围内。
