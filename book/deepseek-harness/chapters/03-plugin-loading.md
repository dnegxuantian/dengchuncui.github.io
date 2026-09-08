# 第 3 章：插件为什么装上了，却没有生效

“安装成功”是包管理器的结论，不是 Agent 的验收结论。本次原创插件的第一版就证明了这一点：包能安装，工具能出现，单元测试也通过，真正调用却失败。

先把加载链路弄清楚，才能区分这个失败究竟发生在哪里。

## 3.1 Manifest 里要看什么

本书示例是 ESM 包，入口为 `index.js`。`package.json` 中与 DSH 组合直接相关的是：

```json
{
  "name": "dsh-book-job-summary",
  "version": "0.1.1",
  "type": "module",
  "main": "index.js",
  "dsh": {"bundle": {"patch": "cordis.patch.yml"}}
}
```

完整文件在 [示例目录](../examples/job-summary/package.json)。这段不是完整可发布 manifest 的替代品；许可证、打包白名单等还在原文件里。

补丁文件把插件加入配置树：

```yaml
- insert:
    - id: book-job-summary
      name: dsh-book-job-summary
```

包名用于解析代码，配置节点 id 用于识别树中的条目，工具名 `book_job_summary` 则是提供给模型的调用名称。三个名字职责不同，搜索日志时不能只搜其中一个。

## 3.2 装到了哪个 profile

实际实验先在示例目录执行 `npm pack --ignore-scripts`，再把本地产生的 tarball 加到隔离 Web profile：

```sh
dsh plugin --profile web add /absolute/path/dsh-book-job-summary-0.1.1.tgz
dsh --profile web --dump-config
```

执行前设置自己的 `DSH_HOME`。如果启动服务和安装命令使用了不同 home，即使两边都叫 web，也不是同一份配置。

检查最终配置中有没有 `book-job-summary`。没有，继续查安装目标与 Bundle；有，继续查加载和依赖。不要在这一步就修改模型提示词。`--dump-config` 可能带出个人配置，公开求助前必须脱敏。

本次插件声明 `inject = ['tools', 'fs']`，注册一个工具，并使用宿主文件服务。不是每个插件都会给模型增加工具：Clippy 增加的是界面与会话状态展示，Usage 增加的是统计投影和设置页。用“工具列表里有没有它”验收所有插件，会误判。

## 3.3 加载成功仍然可能调用失败

第一版 `0.1.0` 的真实调用返回：

```text
The "path" argument must be of type string or an instance of Buffer or URL. Received undefined
```

![第一版已加载但实际工具调用失败](../screenshots/09-plugin-first-failure.png)

这时安装层已经不是第一嫌疑：模型确实调用到了工具，异常来自执行过程。后来发现我把字符串直接传给 `ctx.fs.readText()`，而宿主接口接收的是 `FsTarget`。正确过程是先 `resolve()`，再 `readText()`。第 9 章会展开这次错误，尤其是为什么 15 项单元测试没有挡住它。

修复后升级到 `0.1.1`，重启同一隔离服务，再发送任务，真实结果通过。没有因为第二版成功就删掉第一版记录，它恰好是理解加载边界最直接的材料。

## 3.4 排查时只问下一层的问题

包目录不存在，查安装；包存在但配置没有节点，查组合声明；节点存在但服务缺失，查依赖和加载输出；调用发生但抛错，查执行接口；工具成功但回答错误，查结果进入模型后的解释。

这些阶段不是一份错误码大全，而是缩小范围的方法。社区速报中的 `prepare undefined`、客户端依赖加载失败，都应先还原所在阶段，再核对宿主与插件版本。历史报错文字相似，不表示今天的根因一定相同。
