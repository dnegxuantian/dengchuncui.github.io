# 分工审查一个改动

本插件配合《DeepSeek Harness：即插即用的实战指南》第4.11节。
`review_change`把练习项目的代码、测试、README分给三个独立子会话，返回各自判断与相互矛盾的条目。它不会修改或执行被审查的代码，也不会自动批准合并。

## 环境与安装

实测为macOS、Node.js 25.8.0、官方DSH 0.1.1-rc.2、DeepSeek-V4-Flash。
插件通过Context服务工作，不额外安装DSH核心模块。

先在第1章的dsh-book/runner目录执行`export DSH_BIN="$PWD/node_modules/.bin/dsh"`，沿用本地安装，不要求全局dsh命令。模型密钥沿用第1章的环境变量设置，不写入配置。然后在本节review-panel目录执行：

```sh
export DSH_HOME="$PWD/.dsh-home"
"$DSH_BIN" plugin --profile web add "$PWD/dsh-book-review-panel-0.1.4.tgz"
cd fixture
"$DSH_BIN" --profile web --patch ../browser.patch.yml --patch ../cordis.patch.yml --no-open --host 127.0.0.1 --port 3114
```

浏览器打开http://127.0.0.1:3114，使用浏览器内目录选择器打开fixture目录，保留标准模式。
发送：

> 请调用review_change审查这个练习改动，不自行读取其他文件，也不修改项目。按代码、测试、文档分别说明判断和冲突，不以多数票决定合并。

`fixture`是专门编写的练习项目：README声称拒绝越界目标与重复目标，实现却没有相关校验，原有测试也没有覆盖这两项。

## 文件与配置

- index.js：读取材料、创建子会话、等待、取消、清理和工具注册。
- schema.js：结果字段、引用取回与冲突比较。
- schema.test.js：纯函数检查，不代替DSH调用。
- cordis.patch.yml：provider选择、每路输出token上限与每路超时。
- browser.patch.yml：关闭原生目录窗口、启用浏览器目录选择器，并选择本节实测模型。

三个角色的文件分配在index.js的filesByRole中；换自己的项目时先改这里及rolePrompts，再改schema.js的检查主题。代码、配置修改后执行`npm pack --ignore-scripts`，用相同DSH_HOME重新plugin add生成的tgz，停止旧进程后重启。

审查过程中，在同一主会话输入`/review-cancel`，点击出现的命令候选，再键入`tests`并发送，便可只收回测试一路。请确认输入框已显示命令及参数提示；整段粘贴为普通消息可能进入模型对话。`code`、`docs`和`all`也可用。已结束的工作不会被重新标记为取消。停止主任务会通过父取消信号传递给仍运行的子任务。

结果中`completed`表示子会话正常提交、引用位置有效，不保证模型的理由正确。`returns_plan`与`throws_error`表示函数对输入的处理；`unknown`表示该路材料不能确定。请同时阅读原文和理由。

本节使用spawn：子会话不带父聊天，但仍共享DSH进程并继承工作区与部分配置。工具限制不是操作系统沙箱。只使用可信插件；不要把不可信的插件JavaScript当作被此工具隔离。

## 本地检查与卸载

```sh
node --test schema.test.js
"$DSH_BIN" plugin --profile web remove dsh-book-review-panel
```

卸载后也应去掉启动命令中的cordis.patch.yml，否则启动配置仍会请求加载一个已卸载的包。此目录下的.dsh-home仅是读者创建的练习配置，不应打包或提交。
