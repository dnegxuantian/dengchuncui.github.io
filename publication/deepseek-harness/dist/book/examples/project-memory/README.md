# 项目约定插件

保存当前项目的测试命令等约定，新会话自动取得现行值；变更需要逐次审批，过时版本不能覆盖新值。本例的两个项目均为虚构练习目录，不包含应用代码；保存命令不会执行命令。

## 安装和启动

配套 ZIP 解压后，在 `dsh-book/project-memory` 目录运行。使用 macOS、Node.js 22.19+（22.x）或24+，以及已配置的 `DEEPSEEK_API_KEY`。DSH 固定为0.1.1-rc.2，插件为0.1.1。

```sh
memoryRoot="$PWD"
npm install --prefix ../runner
memoryDsh="$memoryRoot/../runner/node_modules/.bin/dsh"
export DSH_HOME="$memoryRoot/.dsh-memory"
"$memoryDsh" plugin --profile web add "$memoryRoot/dsh-book-project-memory-0.1.1.tgz"
cp -R fixture workspaces
git -C workspaces/aurora-web init
git -C workspaces/atlas-cli init
cd workspaces/aurora-web
"$memoryDsh" --profile web \
  --patch "$memoryRoot/browser-picker.yml" \
  --patch "$memoryRoot/model.patch.yml" \
  --no-open --host 127.0.0.1 --port 3108
```

`cp`步骤只在首次准备目录时运行。打开终端打印的Web地址，在页面选择`workspaces/aurora-web`；不要与日常DSH共用本例的DSH_HOME。端口被占用时改成空闲端口。`browser-picker.yml`只把原生目录选择器换成网页选择器，不更改记忆逻辑。

## 第一次使用

在DSH对话框发送：

> 请先用project_memory_read读取当前项目约定，再调用project_memory_set保存test_command=npm test，原因是团队当前约定。请调用工具发起审批，我会在界面确认。

检查审批中的项目、原值、新值，点击“允许一次”。展开set结果，应有`saved:true`和`revision:1`。模型只回复“请确认”时，工具可能尚未调用；要求它实际调用set，不要把文本回复当成保存成功。

同一项目中新建会话，询问“当前项目已保存的测试命令是什么？只按本次上下文回答，不调用工具。”应取得`npm test`。

要求先读再纠正为`pnpm test`，经审批后为revision 2。切换到atlas-cli，read应为空，可独立保存`npm run check`。再次回到aurora-web，不应取得另一项目的约定。

## 修改自动带入行为

打开本例`$DSH_HOME/profiles/web/cordis.patch.yml`，将下面条目加入顶层数组（默认只有空数组`[]`时替换它）：

```yaml
- id: book-project-memory
  config:
    injectMemory: false
```

配置重载后，新建会话再问相同问题。不要在用户消息中给出命令值，也不要沿用已读到该值的会话。此时模型没有自动收到项目约定；明确允许调用`project_memory_read`仍可读取保存值。把false改回true，新会话再次获得约定。启动时也可以用`--patch "$memoryRoot/no-context.patch.yml"`关闭，但不要再用另一个后置Patch覆盖它。

## 文件与实现

- `index.js`：两个工具、审批、版本比较、项目选择、动态上下文。
- `schema.js`：领域存储的记录结构；使用zod，名称为`book_project_memory`。
- `cordis.patch.yml`：Bundle安装后加载插件，默认打开自动上下文。
- `model.patch.yml`：练习采用DeepSeek-V4-Flash，关闭推理并限制输出长度。
- `fixture/`：两个虚构目录，仅用于项目选择和约定隔离验证。

在源码目录修改代码后执行`npm pack --ignore-scripts`，再用`plugin --profile web add`安装本地生成的包；若CLI要求覆盖确认，检查目标是本例插件。修改包版本可区分多次构建。不要直接编辑安装缓存。

## 数据和边界

Web组合将记录放在`$DSH_HOME/storages/book_project_memory.json`，按工作区ID分区。每个项目最多20条现行约定，保留最近20次修改。聊天记录在会话存储中，二者不是同一份数据。

只适用于一个DSH Host进程的个人练习。项目分区不等于租户安全隔离；持有宿主文件权限的人可以读取存储。不要保存密钥。当前规则不代表命令已执行，也不会给Shell授权。路径移动、账号迁移和多进程共享存储不由这个示例解决。

许可证：MIT。DSH及其依赖遵循各自许可证。
