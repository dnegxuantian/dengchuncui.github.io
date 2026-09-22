# 文档卡片批处理插件

第 4.12 节配套插件，版本 0.1.2，使用官方 DSH 0.1.1-rc.2 验证。

把三份独立的英文练习文档整理成中文卡片。后台执行使用 DSH 的 `ctx.jobs`，模型调用使用 `ctx.llm`。每张卡片包括用途、配置、限制和一条原文引用。来源与产物一起保存在 `checkpoint.json` 中，可以用 `cards_batch` 的 `status` 操作查看。

源文件是虚构项目的练习材料，不是作者的生产案例。引用与字段校验不能证明中文概括一定准确，仍需要对照原文阅读。

## 安装与修改

```sh
npm test
npm pack --ignore-scripts
```

使用第 1 章已经安装的本地 DSH，保留 `DSH_BIN` 的绝对路径和模型环境配置。进入本例目录后，用一个独立家目录安装，不修改日常 Profile：

```sh
export DSH_HOME="$PWD/.dsh-home"
export DSH_TOOLS_MODE=native
"$DSH_BIN" plugin --profile web add "$PWD/dsh-book-batch-cards-0.1.2.tgz" --offline --ignore-scripts --config.auto-install-peers=false --config.update-notifier=false
"$DSH_BIN" --profile web --patch "$PWD/browser.patch.yml" --patch "$PWD/cordis.patch.yml" --no-open --host 127.0.0.1 --port 3118
```

`DSH_BIN` 按第 3.1 节在已经安装的 runner 目录中设置，API 密钥沿用第 1 章的环境变量。插件管理需要 pnpm。`cordis.patch.yml` 的相对目录以启动命令的当前工作目录为准。运行时依赖由已安装的官方 DSH 提供，不在 Profile 中另装一套不同版本的核心服务。`browser.patch.yml` 使用网页内的目录选择器，不弹出系统文件夹窗口。浏览器访问 http://127.0.0.1:3118，选择本插件目录作为练习工作区。其他 DSH 版本未验证。

聊天输入“调用 cards_batch action=start，返回后台任务编号后结束回答”。查看结果用 `cards_batch action=status`，继续已有清单用 `cards_batch action=resume`。取消正在运行的 Job 用官方 `job_kill`，不能把关闭一轮聊天当作取消后台任务。

## 进度与预算

- `savedStage` 是最后保存的批处理阶段；`activeJob` 是当前插件实例的 Job 编号。进程退出后，前者会留下，后者不会。
- 默认预算是两次卡片生成尝试，因此第三张还不能开始。把 `maxAttempts` 改成 3，重新加载配置后 `resume`，可再尝试一次；若前面有失败或取消，需要把这些已用次数一起计算。
- 该预算约束本插件调用模型服务的尝试次数，不是美元限额，也不包含主聊天或提醒生成的调用。服务商返回的 Token 用量另存；缺失用量使用 `null`，不当作零费用。
- 请求前先保存尝试次数；崩溃或失败也不会退回这个次数。若该项结果未确定，需用户明确同意后传 `retryIncomplete=true` 再试。
- 已完成的卡片和进度在同一个 JSON 文件中提交。它是单机练习检查点，不是分布式事务，也不声称支持多台电脑共享运行。

## 文件访问

这个插件是受信任的 Host 代码，直接读取明确配置的 `docsRoot`，写入 `stateRoot`，不经普通模型文件工具的 Sandbox。不要把状态目录设置成敏感目录，也不要与他人共享同一个状态目录。文件名、大小、类型和目录检查用于限制本例输入，不把这些检查称为操作系统级沙箱。

## 返回结果怎样判断

`done` 表示卡片已保存且通过字段、原文引用检查，不表示概括已经人工审核。实际生成中出现过把固定重试延迟写成可配置选项的问题；对外使用前仍须核对原文。`job_output` 返回 `running` 只是当前还没结束，等待超时不应触发重新执行。需要等待时一次使用 `timeout_ms=30000`，不要每几秒启动一轮模型推理。

检查点是本地普通 JSON，勿放入公开下载包。代码改变后运行 `npm test`、`npm pack --ignore-scripts`，停止该练习 DSH，重新执行插件安装与启动命令。默认配置允许用 `schedule_create` 创建会话内提醒；提醒不会自动执行 `cards_batch resume`。
