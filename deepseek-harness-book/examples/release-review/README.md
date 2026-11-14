# 项目发布审查练习

包含一个故意保留文档问题的 CLI 项目，以及可装入 DSH 的发布审查插件。练习项目不是 npm 已发布软件，不需要联网安装，不要发布。

## 文件

- `exercise/`：要审查的项目，故意保留版本、测试命令、配置字段、许可证材料方面的问题。
- `plugin/`：插件入口、完整 Skill、只读工具守卫和安装包。
- `baseline.patch.yml`：本书实测的 Flash 模型配置，不含凭据。
- `evals/evals.json`：同输入对照与守卫测试请求。

## 本地使用

先按书中安装章节准备隔离的 DSH_HOME 与模型凭据。进入 `plugin` 目录后执行：

```sh
npm test
dsh plugin --profile web add "$PWD/dsh-book-release-review-0.2.1.tgz"
dsh --profile web --patch "$PWD/read-only.patch.yml"
```

在 Web 中选择 `exercise` 为工作区，要求发布前只读审查。模型应先调用 `skill`，名称为 `project-release-review`，再读取项目文件。

这是本练习专用 Profile：只读守卫会拒绝除 skill/read/glob/grep 以外的工具。省略额外 Patch 时只有 Skill 提示词，不代表程序禁止命令。读取目录的能力也不等于路径沙箱。

## 修改与复查

修改 `plugin/skills/project-release-review/SKILL.md` 的具体规则，更新 package.json 的版本，`npm pack` 后重新安装。用新的 DSH 会话和相同请求对照；不要让上一轮回答提前告诉下一轮全部问题。包内 0.1.0 是本节实际运行过的初版，仅供理解修改过程；日常练习安装最新包。

练习项目的 `private:true` 是防误发布设置，保留它。模型的“可发布”结论不能替代安装测试、CI、版本和权限控制。本节没有发布任何包，也没有运行练习项目的安装和测试命令。
