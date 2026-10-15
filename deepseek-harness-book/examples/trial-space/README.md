# 陌生插件试验空间

这是第4.7节的配套实现。用虚构插件和本机HTTP服务学习命令白名单、逐次审批、文件写入限制及网络开关。只支持本节验证过的macOS环境；不要在其中运行未经审查的第三方插件。

## 要控制什么

插件提供三处控制：`tools.js` 检查模型请求的固定命令，写报告前通过 DSH 请求一次性审批；`sandbox.js` 为 Shell 子进程生成 macOS Seatbelt 规则，可以额外禁止联网。

文件策略仍使用 DSH 的 `read-only` / `workspace-write`。后者允许写入工作区及平台规定的临时区域。它不禁止读取目录外文件。网络限制作用于经此提供方启动的子进程，不限制 Host 自己的模型请求。

Node.js 插件本身运行在 Host 里。这套组合不能把恶意同进程插件隔离，也不能代替独立账户、容器或虚拟机。请只运行这里可检查源码的练习程序，不把未审查代码直接安装到日常 DSH。

## 文件

- `sandbox.js`：替换的 SandboxProvider，仅实现 macOS。其他平台抛错，不退回无约束执行。
- `tools.js`：`trial_run` 工具、命令白名单和写报告前的审批。`write-report` 的授权只允许工作目录内写入，不扩大沙箱范围。
- `cordis.patch.yml`：禁用原 `sandbox` 条目，插入新提供方及工具。按 id 的普通 Patch 不能靠 `name` 字段替换原插件。
- `online.patch.yml`：把新提供方的 `offline` 改为 `false`，用于网络开关对照。
- `count.patch.yml`：向允许命令中增加 `count-files`。
- `fixture/`：虚构插件元信息、工作目录及目录外标记文件；不使用个人真实数据。
- `local-server.mjs`：只监听127.0.0.1:43117，响应 `/ping`，不接收上传内容。

`diagnostic.js` 是模型连接故障时使用的内部预检入口，不在npm包中，也不是正式教程的替代流程。它通过DSH命令注册表调用实际Shell及沙箱，但没有经过模型工具分发或审批。

## 安装和启动

将配套文件解压到Documents、Downloads等普通目录，不要放进系统临时目录。已安装DSH后，在本目录执行以下终端命令。`trial_home` 保存独立DSH配置；`trial_files` 建在配套目录下，因为DSH默认允许写入系统临时区域，在那里测试相邻目录写入会得出错误结论。保留终端，后续还要使用这几个变量。

```sh
trial_source="$PWD"
trial_home="$(mktemp -d)"
trial_files="$(mktemp -d "$trial_source/trial-files-XXXXXX")"
export DSH_HOME="$trial_home"
cp -R "$trial_source/fixture/." "$trial_files/"
git -C "$trial_files/workspace" init -q
dsh plugin --profile web add "$trial_source/dsh-book-trial-space-0.1.1.tgz"
cd "$trial_files/workspace"
dsh --profile web --patch "$trial_source/browser-picker.yml" --patch "$trial_source/model.patch.yml" --no-open --host 127.0.0.1 --port 3106
```

模型密钥沿用第1章的环境变量配置，不填写在本目录的任何文件里。打开终端显示的本地网址，选择 `trial_files` 下的 `workspace`；这里使用浏览器内的目录选择器，不调用系统文件夹窗口。

在另一个终端运行 `node local-server.mjs`（先进入配套目录），保持它运行，以便做网络开关对照。

在DSH输入：`请仅调用 trial_run，command=inspect，展示实际返回。` 工具应返回虚构包的名称、版本和许可证。其余命令及结果见正文。

将 `count.patch.yml` 的完整内容保存到 `$DSH_HOME/profiles/web/cordis.patch.yml`，可测试命令白名单变化；若还要开放网络，在同一文件末尾追加 `online.patch.yml` 的完整内容，不要覆盖前一项。配置文件会被DSH监测，改后用真实调用确认。

停止练习时在两个服务终端按 Ctrl+C，再 `unset DSH_HOME`。保留临时目录即可重看会话及文件，不需要删除任何个人数据。

## 实际验证范围

DSH 0.1.1-rc.2、本机macOS、包0.1.1实际加载并由模型调用。目录外标记可读、写入被拒；`offline=true` 时连接本机测试服务得到 `connect EPERM`，改为false后得到 `HTTP 200 trial-pong`。count-files修改前被守卫拒绝，修改后返回目录条目数1。

`sandbox.denied` 按提供方配置的错误片段匹配。本例的 `operation not permitted` 不匹配网络错误 `connect EPERM`，所以网络被拒时该字段仍为false。要结合操作、错误与对照结果判断，不能把它当通用的安全验收标志。

写报告时拒绝审批不生成文件；允许一次后在工作区生成report.json，再次调用仍需审批。切换Read Only后，即使允许这次操作，写入仍被系统拒绝。另一全新DSH_HOME已从压缩包安装，并实际重跑默认配置的四项模型调用。完整书稿的图文与跨章验收另外记录，不由这些测试代替。
