# 任务交接单压缩插件

配套第 4.10 节，替换 DSH 的摘要生成方法，保留官方压缩范围选择和会话保存。
运行版本：DSH 0.1.1-rc.2；本轮配套安装检查环境为 macOS、Node.js 25.8.0。

## 安装

将配套 ZIP 解压到自己的练习目录，在 `compaction-checkpoint` 目录执行：

```sh
npm install --prefix runner @deepseek-ai/dsh@0.1.1-rc.2
export DSH_HOME="$PWD/dsh-home"
node runner/node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile web add "$PWD/dsh-book-compaction-checkpoint-0.1.4.tgz" @deepseek-ai/dsh-compaction-basic@0.1.1-rc.2 @deepseek-ai/dsh-llm@0.1.1-rc.2
node setup.mjs
cp -R fixture work
```

`setup.mjs` 复制此版本自带的标准模式，仅替换压缩插件和摘要预算。
新增配置在 `$DSH_HOME/.agent-presets/checkpoint/`，不会改官方文件，也不会覆盖已有同名模式。
示例插件通过这份配置加载，没有声明 Bundle；安装器把它称为普通依赖不等于安装失败。

按第 1 章的方法配置模型凭据。本例使用环境变量 `DEEPSEEK_API_KEY`，不要把密钥写入插件或截图。
在同一终端启动（保留刚设置的 `DSH_HOME`）：

```sh
node runner/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --patch "$PWD/browser.patch.yml" --no-open --host 127.0.0.1 --port 3113
```

访问 http://127.0.0.1:3113/，添加 `work` 的绝对路径为工作区。
先选工作区，再在新会话中把“标准模式”切换成“任务交接单”。
按正文分两步读取、修改练习，空闲时发送 `/compact`，展开摘要检查后再继续。
目录选择在浏览器内进行；`browser.patch.yml` 禁用原生目录窗口。

## 修改

`index.js` 是插件入口，`instruction` 是摘要要求。模型返回待办原文编号，插件负责复制对应文本。
改变源码后先停止空闲的示例 DSH，执行 `npm pack`，再用前面的 `plugin ... add` 命令安装新包并重新启动。
已有会话中已经保存的摘要不会被新代码追溯重写；比较策略时使用两份未修改的 `fixture` 副本和两个新会话。

配置中的 `maxTokens: 2048` 是摘要输出预算，不是整个会话的长度。
`/compact` 是手动触发，不能用本例证明自动达到模型上下文上限的行为。
压缩依赖已配置模型，会产生模型调用费用。

## 文件与限制

- `fixture/`：Markdown 链接检查器的初始练习，不是完整 Markdown 解析库。
- `setup.mjs`：生成独立 Preset，不安装依赖、不读取密钥。
- `browser.patch.yml`：浏览器目录选择和本例模型配置。
- `LICENSE`：本节原创示例的 MIT 许可；官方依赖遵循各自许可证。

待办原文校验能拒绝不存在的编号，不能保证模型没有漏选、误选过时要求，也不能保证其他摘要字段正确。
模型生成结果会变化；以实际 CLI 输出和退出码验收，不能只看测试计数。
