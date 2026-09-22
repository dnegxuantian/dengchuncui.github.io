# 安全审阅 Bundle

本书 4.13 的配套插件。针对 DSH CLI 0.1.1-rc.2，实际验证环境为 macOS / Node.js 25.8.0。

它在模式菜单加入“安全审阅”，只允许工作区内的 read、glob、grep；其他工具执行会被 guard 拒绝。文件工具仍声明 write/edit，但本预设不允许它们执行。不加载 Shell 工具。guard 不隔离同进程插件代码，不把它用于运行不可信插件。

## 放置与安装

将本目录放在第 1 章配套目录 dsh-book 中，与已安装依赖的 runner 同级。在 safe-review 目录运行：

```sh
export DSH_HOME="$PWD/../safe-review-home"
../runner/node_modules/.bin/dsh plugin --profile web add "$PWD/dsh-book-safe-review-0.1.4.tgz" --ignore-scripts --config.auto-install-peers=false
cd fixture
../../runner/node_modules/.bin/dsh --profile web --patch ../browser.patch.yml --no-open --host 127.0.0.1 --port 3119
```

沿用第 1 章在当前终端设置的 DEEPSEEK_API_KEY。不要把密钥写入本目录。进入网页后选择 fixture 工作区和“安全审阅”；输入框下方应为 Read Only。

fixture 是虚构练习，包含故意写错的运费边界与缺少边界测试的代码。其 postinstall 只写练习标记；不要在 fixture 中执行 npm install。这里要读脚本，而不是运行它。

## 修改与卸载

修改 presets/book-safe-review/agent.cordis.yml 的 persona 文本可改变审阅要求。开发时可以编辑隔离 Profile 中已安装的副本，创建新会话观察变化；正式更新应修改这里的源文件、提升 package.json 版本、npm pack --ignore-scripts，再安装新 tgz。

停止本节 DSH 后，在 safe-review 目录、同一个已设置 DSH_HOME 的终端执行：

```sh
../runner/node_modules/.bin/dsh plugin --profile web remove dsh-book-safe-review
```

重启后自带审阅模式消失，官方目录服务恢复。已保存的审阅会话需要对应插件才能重新组成，不会自动迁移为标准模式；重新装回同一版本可恢复其依赖。卸载不删除会话记录或练习文件。

## 文件

- package.json：包名、版本、导出路径和 dsh.bundle.patch。
- cordis.patch.yml：停用原目录服务行，插入本节的目录服务。
- roster.js：继承官方 AgentPresets，保留官方预设目录；切换本节预设后设置 Read Only。
- presets/book-safe-review/preset.yml：模式名称与说明。
- presets/book-safe-review/agent.cordis.yml：本模式的插件组合。
- guard.js：本模式内的工具执行检查。
- browser.patch.yml：让目录选择留在网页，配置本节模型输出上限。

依赖由 DSH 的插件加载器从 CLI 安装和 Profile 中解析；不把此包当成普通 Node 程序直接执行。roster.js 从 @deepseek-ai/dsh/package.json 定位 CLI 随附的预设目录，自建非 CLI 宿主需要提供自己的目录，不应照搬这一定位方式。

代码采用 MIT 许可证，见 LICENSE。
