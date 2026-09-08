# 第 9 章：从零写一个作业耗时插件

这个插件只做一件事：读取工作区内的 JSON 作业样本，校验字段，返回确定的统计结果。计算交给代码，指标解释交给模型，二者分开验收。第 6 章已经说明为什么有必要这样分。

完整可运行源码在 [examples/job-summary](../examples/job-summary/README.md)，没有需要读者自行补齐的伪代码。阅读版书末也附完整入口、统计实现和测试。

## 9.1 先定义数据语义

输入必须是非空数组，每项有非空 name 和非负有限数 durationSeconds。不把字符串 `"12"` 自动转成数字，以免上游数据类型问题被悄悄掩盖。重复名称视为多次观测，不去重；零耗时允许；求和溢出则拒绝。

输出有 count、totalSeconds、averageSeconds、minSeconds、maxSeconds、medianSeconds、p95Seconds、percentileMethod。P95 固定 nearest-rank，避免代码升级时悄悄改变统计口径。对偶数样本，中位数取中间两个数的平均。

这些选择不是所有场景的唯一答案，但必须写明。生产作业还可能需要失败记录、重试和时间单位规范，本例没有这些字段，因此不擅自推断。

## 9.2 把纯计算与宿主适配分开

`stats.js` 不依赖 Harness，可直接在 Node 中测试。入口 `index.js` 负责注册工具、文件读取和参数边界。这样的拆分可以分别回答两个问题：数字算得对不对；宿主接口用得对不对。

工具通过 `ctx.tools.register()` 注册，参数 schema 只允许 file_path，输出 schema 明确字段和类型。render 把结构化结果转成 JSON 文本交给模型。描述里明确总和不是墙钟时长；描述有帮助，但第 6 章实测表明它不能保证模型解释不犯错。

入口声明依赖 `tools` 与 `fs`，不自己创建文件服务。执行时使用 `exec.signal`，让文件操作有机会响应取消；本书验证了信号传递，没有完成长读中途取消的端到端试验。

## 9.3 第一次实现为什么错了

我第一次写成了类似 `ctx.fs.readText(args.file_path, exec.signal)` 的调用。真正宿主的接口要求先解析为目标：

```js
const options = {cwd, signal: exec.signal};
const workspace = await ctx.fs.resolve(cwd, options);
const target = await ctx.fs.resolve(args.file_path, options);
if (!ctx.fs.contains(workspace, target)) {
  throw new Error('File is outside the session workspace');
}
const text = await ctx.fs.readText(target, exec.signal);
```

这里省略的是完整入口中已经存在的文件类型与大小检查，不是建议读者删掉它们。完整实现见 [index.js](../examples/job-summary/index.js)。宿主接口来源为固定提交的 [Fs 定义](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/fs/fs/src/index.ts)。

错误替身接受字符串，因此第一次单测全过。真实宿主抛错以后，我同时改了实现和替身，要求测试中传入 resolve 产生的对象。这比增加更多同类算术测试有效，因为故障发生在接口边界。

## 9.4 打包和实际调用

在示例目录运行：

```sh
npm test
npm pack --ignore-scripts
```

得到 `dsh-book-job-summary-0.1.1.tgz` 后，用第 3 章命令安装到隔离 profile，再重启它。实际模型调用成功返回数量 3、总和 30、平均值 10、最小 8、最大 12、中位数 10、P95 12。

![修正接口后的真实工具结果](../screenshots/10-plugin-fixed-result.png)

下一次故意读取 `jobs-invalid.json`，其中 durationSeconds 为字符串。真实工具在计算前拒绝，模型直接报告错误，没有改数据或换工具。

![坏输入被工具拒绝](../screenshots/14-plugin-invalid-data.png)

这是一个有用的失败：拒绝发生在输入边界，错误保留字段位置，没有输出似是而非的统计。对工程工具而言，可靠拒绝也是功能的一部分。

## 9.5 本例还不能承担什么

这不是生产任务治理插件。它没有读取调度平台、认证企业数据源、处理大文件、推断 SLA 或进行自动修复。Windows 路径也未支持。想扩展到真实平台，应先确定数据和权限契约，再接入对应服务，而不是把生产密码加入这个教学工具。
