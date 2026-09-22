# DSH 可恢复实验工作台

只在隔离练习工作区使用。配套提供文件准备、配置检查、交互输入、暂停/继续、SIGINT 与网页重连的练习，以及独立的工具调用限制配置。

插件通过 DSH 的 Filesystem 创建 JSONL 示例、配置和交互程序，通过 Shell 检查配置，通过 PTY 运行、输入、观察及取消。数据是虚构练习数据，不访问网络或数据库。

工具 experiment_workbench 的 prepare 不覆盖已有文件。open 返回的 sessionId 作为后续 terminalId。send/launch 启动程序，send/run 开始逐行检查，send/pause 暂停，send/status 查进度。read 查看终端保留的输出，result 读取写出的统计，interrupt 发 SIGINT，close 关闭终端。

网页重连和 Host 重启不同：PTY 不会跨 Host 进程重启恢复。result.json 是统计结果，不是可重放检查点。

## 安装

使用 DSH 0.1.1-rc.2，在本目录执行以下命令。先在当前终端配置自己的模型凭据；新的 DSH_HOME 不继承日常设置。

```sh
export DSH_HOME="$(mktemp -d)"
dsh plugin --profile web add "$PWD/dsh-book-experiment-workbench-0.1.2.tgz"
dsh --profile web --patch "$PWD/model.patch.yml" --patch "$PWD/only-workbench.patch.yml"
```

在 Web 中选择一个专用练习目录。先请求 prepare/check/open/send-launch，保留终端，后续用返回 id 继续 send/run。正常检查不是先写一套替代程序。

Bundle 增加 terminal 服务与 terminal-bash 后端；不要叠加到已配置另一个 terminal 服务的 Profile。额外 Patch 仅允许模型调用 experiment_workbench，防止模型改用其他工具；它不是系统沙箱，插件内部仍使用 DSH 配置的文件和进程服务。
