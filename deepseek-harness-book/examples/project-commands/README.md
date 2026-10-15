# 项目命令速查

这是《DeepSeek Harness：即插即用的实战指南》第三章的只读教学插件，适配 DSH 0.1.1-rc.2。

`project_commands` 读取当前会话工作区根目录的 package.json，返回 scripts 中真实存在的命令。0.2.0 的可选 filter 对脚本名称进行不区分大小写的子串筛选。插件配置 maxCommands 控制最多显示多少项，默认为 20；total 是筛选后的总数，limited 表示有结果被省去。

插件不运行脚本，不读取其他项目，不把项目脚本当成执行指令。只支持根 package.json，不递归扫描 monorepo。宿主仍应信任插件代码；这里的路径检查不能隔离恶意同进程插件。

## 配套文件

- package.json：npm 包入口、版本、运行要求和对等依赖。
- index.js：依赖声明、工具注册、参数与输出定义、DSH 文件服务调用。
- catalog.js：纯脚本目录提取逻辑。
- catalog.test.js：纯函数测试，不能替代 DSH 真实集成验证。
- cordis.patch.yml：0.2.0 新增的组合条目，由 package.json 的 dsh.bundle.patch 声明。通过 dsh plugin 安装后加入 Profile，不再另外插入同一个工具条目。

执行 `npm test` 可运行不依赖 DSH 的目录逻辑测试。使用 `npm pack` 生成包，再通过 `dsh plugin --profile headless add /绝对路径/包名.tgz` 安装到隔离的 DSH_HOME。DSH 的运行包提供对等依赖；optional 只防止包管理器另外安装一份运行时，不表示使用时可以缺少它。

安装、加载、配置与卸载的最终操作说明以本书第三章真实验证后的教程为准。本文件不是完成状态声明。
