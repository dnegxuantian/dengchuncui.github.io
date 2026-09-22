# repo_lookup：给代码阅读找起点

本地 DSH 0.1.1-rc.2 的 Tool 插件。选择一个 JS/TS Git 仓库根目录作为工作区，询问一个类或函数的名字，得到定义候选、引用、提到该名字的测试以及 Git 提交。随后让 DSH 用 read 打开具体位置。

依赖 Node.js 22.19+（或 24+）、Git，以及 DSH 提供的 @deepseek-ai/dsh-tools。

在此目录运行 `npm test`，随后 `npm pack`。在自己的隔离 DSH 环境执行：

```sh
dsh plugin --profile web add /绝对路径/dsh-book-repo-lookup-0.1.2.tgz
dsh --profile web
```

安装包自带 cordis.patch.yml，无需重复插入同一插件。工作区选 Git 仓库根目录。自然语言输入：

> 请用 repo_lookup 查 DeepSeekAdapter，告诉我定义、使用位置、相关测试和提交记录。接着读取类定义和其中一个测试，解释你从代码确认了什么，不要修改文件。

模型传给工具的参数是 `{"symbol":"DeepSeekAdapter"}`，并非整句话。仓库目录由当前 DSH 会话提供。

想调整结果数量，在额外的 Patch 文件里写：

```yaml
- id: book-repo-lookup
  config:
    maxPerGroup: 2
```

然后重新启动 `dsh --profile web --patch /绝对路径/two-results.yml`。这是覆盖配置，不再 insert 第二份插件。

`index.js` 负责注册、声明输入和输出、取得会话目录；`lookup.js` 负责 Git 查询、结果分组和显示格式。0.1.0 用 JSON 文本显示，0.1.1 改为路径和行号的紧凑列表；结构化返回值没有变。源码不运行被查询项目的测试或脚本。

搜索只含 Git 跟踪的 JS/TS 工作区文件，不含未跟踪文件、二进制文件或其他语言。声明由文本模式识别，可能误判注释、漏掉方法声明和别名；测试列表不代表测试覆盖率。提交来自 HEAD 可达历史，Git -S 寻找字符串出现次数有变化的提交，不能列出这个函数的每一次修改。浅克隆只有已有历史。无提交的空仓库会报错。

这份实现直接在本机 Host 启动 Git，不通过 DSH Shell 服务，不能当作 Sandbox 的示范。不要在远程文件服务场景使用，不要把可执行插件当作不可信文本安装。查询结果也是项目数据，不应被当作系统指令。

Git 命令每次限 15 秒、输出限 2 MiB；超限会报错，不会以一份截断结果冒称完整检索。每组返回上限与实际命中数一起提供，行文本最多 400 字符；后续仍需读原文件。测试用临时练习仓库，不代表完整 DSH 集成验证。
