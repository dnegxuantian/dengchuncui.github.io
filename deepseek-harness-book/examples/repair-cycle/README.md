# 测试—修复—再测试

这个插件给DSH增加一个有限次数的代码修复循环。模型读取要求并修改源码；模型准备结束回答时，插件运行测试。测试失败会被送回模型，复测次数用完则停止修改，把剩余问题交给用户。

练习项目把文档标题转成网址片段，例如`  Café & API: v2  `转成`cafe-api-v2`。原实现有意保留缺陷。另有一份需求冲突的练习：同一个输入被要求返回两个不同的值，用来观察循环怎样结束。两份都是教学样本，不是真实线上事故。

## 环境与文件

配套使用`@deepseek-ai/dsh@0.1.1-rc.2`，插件版本0.1.3。本节在macOS、Node 25.8.0、DeepSeek-V4-Flash上操作。测试命令采用POSIX的`env`命令，不宣称已经支持Windows原生命令环境。Node须满足DSH的版本要求：22.19及以上的22.x，或24及以上。

- `index.js`：三个工具与Agent Loop钩子。
- `cordis.patch.yml`：安装时装配插件及默认配置。
- `model.patch.yml`：本次使用的模型配置。
- `browser-picker.yml`：使用网页内目录选择器，不调用系统文件夹窗口。
- `one-round.patch.yml`：把最多复测次数从2改成1。
- `step-budget.patch.yml`：把模型步骤上限改成3，用来观察停止条件。
- `slow-test.patch.yml`：给练习测试加12秒等待，留出点击停止的时间。
- `fixture/`与`fixture-conflict/`：正常修复与需求冲突的原始练习。先复制，保留它们用于重新开始。
- `dsh-book-repair-cycle-0.1.3.tgz`：安装包；修改源码后需重新打包安装。

## 安装并运行

以下命令从解压后的`dsh-book`目录执行。`runner`目录与`repair-cycle`目录同级。

```sh
npm install --prefix runner
export DSH_HOME="$PWD/.dsh-repair"
repair_cli="$PWD/runner/node_modules/@deepseek-ai/dsh/lib/bin.js"
repair_example="$PWD/repair-cycle"
node "$repair_cli" plugin --profile web add "$repair_example/dsh-book-repair-cycle-0.1.3.tgz"
mkdir -p workspaces
cp -R "$repair_example/fixture" workspaces/normal
cd workspaces/normal
git init
node "$repair_cli" --profile web \
  --patch "$repair_example/browser-picker.yml" \
  --patch "$repair_example/model.patch.yml" \
  --no-open --host 127.0.0.1 --port 3110
```

等安装命令真正退出再启动，不要看到依赖列表中的`done`就提前打开服务。模型凭据沿用第1章的`DEEPSEEK_API_KEY`环境变量配置；配套文件不含密钥。也可以用本地已经安装的同版本CLI，保持同一个隔离`DSH_HOME`。

访问`http://127.0.0.1:3110`，在网页内选择刚才的`workspaces/normal`，确认会话模式为`Workspace Write`。然后在对话框发送：

```text
请修复这个练习项目的标题转网址函数。先调用repair_start，再读取要求和源码并修改。只修改src/slug.mjs，不修改测试。修改完成后结束本次说明，让循环插件复测；按实际测试结果用中文汇报。
```

展开`repair_start`可以看到初始测试失败。模型随后通过`repair_read`读取文件，再用`repair_write_source`提交完整源码。`修复循环结束：passed`是插件复测后给模型的通知。网页里的模型总结仍需与测试结果核对。

插件只写选中练习目录的`src/slug.mjs`；写入使用当前会话的文件策略，不会为了通过测试升级权限。测试子进程使用只读策略，`testSandbox`字段描述的是测试命令，不代表整个会话不能修改源码。

## 观察未修好时的处理

在另一个终端复制`fixture-conflict`到一个新的工作目录并执行`git init`，再在网页添加这个目录、创建会话。不要覆盖刚才的修改。发送：

```text
请修复当前练习项目的toSlug函数。先repair_start再读取README和测试，按需求修改src/slug.mjs。不要修改测试，不要伪造测试输出或按调用顺序返回不同值。发现需求冲突请如实说明，由循环插件复测并决定何时停止。请用中文汇报。
```

第一项要求`Hello World`变成`hello-world`，第六项却要求同一个输入得到`Hello_World`。确定性函数无法同时满足两项，模型需要指出这个冲突。默认最多复测2次：第一次失败后给模型继续处理的机会，第二次仍失败则通知`round-budget`并结束。这里的次数不包含开始时的那次基线测试，也不等于模型请求次数。

要改成最多复测1次，先等当前任务结束，停止本节的DSH进程。重新执行上面的启动命令，在`--no-open`之前增加下面的补丁参数（放在Web服务参数之后会被误交给Web入口，报`unknown option '--patch'`）：

```sh
--patch "$repair_example/one-round.patch.yml"
```

使用新复制的冲突项目，再发送相同请求。对比结束通知中的`round`、`maxRounds`以及中间是否出现“继续修复”。不要通过放宽测试断言来制造通过。

## 停止与步骤上限

运行中的任务可以在网页点击停止。若测试结束太快，启动时增加`slow-test.patch.yml`，使用一份新的正常练习目录，在`repair_start`执行期间点击停止。该补丁只给测试加等待，不伪造失败或模型结果。

`maxRounds`只能限制模型准备结束后发生的复测。如果模型一直调用工具，可能迟迟不进入复测，所以插件还设置`maxSteps`，默认14。这一计数从`repair_start`创建修复状态之后开始，并包括结束总结的模型步骤。`step-budget.patch.yml`把上限改成3，适合查看这个保护怎样触发。它不限制整个DSH进程，也不代替模型请求本身的超时。

## 修改、打包与卸载

要改继续或结束条件，修改`index.js`中的`agent/turn-stopping`；要改默认次数，修改`cordis.patch.yml`的`maxRounds`。读取源码和测试的工具与决定循环去留的钩子分开，便于只改一处观察差异。

源码变更后提高`package.json`版本，在插件目录运行`npm pack`，停止空闲的本节DSH，使用前面的`plugin --profile web add`安装新生成的tgz，再启动复测。不要编辑node_modules作为正式交付。

卸载命令在同一个`DSH_HOME`下执行：

```sh
node "$repair_cli" plugin --profile web remove dsh-book-repair-cycle
```

卸载后重启才检查新会话的工具列表；练习源码及会话记录不会因为卸载这个包自动恢复。

## 使用范围

这是对可信练习项目的修复循环，不是运行任意陌生代码的平台。测试文件在每次执行前校验摘要，模型工具不能写测试；退出码、完成状态和测试数量共同用于判断通过。这些检查不能证明测试足够全面，也不能防御恶意测试程序伪造输出。真实项目仍需代码审查和相应的执行隔离。

配套代码使用MIT许可证，见`LICENSE`。DSH及其依赖保留各自许可证。
