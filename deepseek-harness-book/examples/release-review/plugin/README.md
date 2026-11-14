# project-release-review

DSH 0.1.1-rc.2 发布审查练习插件。安装包贡献一个文件系统 Skill 来源和一个简短 System Prompt 段，不替换完整系统提示词。

在此目录运行 `npm pack`，随后在隔离环境中执行 `dsh plugin --profile web add /绝对路径/生成的安装包.tgz`。启动 Web，选择练习项目目录，要求发布前审查。检查会话中是否调用了 `skill`，其参数应为 `project-release-review`。

本插件不发布 npm 包。默认只读是提示词要求；要在本练习专用 Profile 强制限制工具，启动时加 `--patch /绝对路径/read-only.patch.yml`。它仅允许 skill、read、glob、grep，其他工具即使被模型调用也会被拒绝。

守卫注册在本 Profile 的 Host 全局层，会影响这份 DSH 中所有会话；不要把它装到日常多用途环境。它约束经过 Tool 服务的调用，不是操作系统沙箱，不限制已加载插件自行运行的代码，也不限制 read 可读取的路径。目录权限应由文件系统或 Sandbox 另行配置。

包内 `guard.js` 独立于 Skill，`npm test` 检查白名单与默认拒绝规则。独立测试不代表 DSH 已实际拦截；还要在界面中请求一次 Bash pwd，检查工具返回的拒绝结果。练习项目保持 private:true，不能因为模型说可以发布就执行发布。
