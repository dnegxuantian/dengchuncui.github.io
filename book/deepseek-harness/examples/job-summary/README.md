# dsh-book-job-summary

本书配套的 macOS 教学插件。输入 JSON 任务耗时，返回数量、总和、均值、中位数及 nearest-rank P95。使用宿主的 `ctx.fs`，不直接调用 Node 文件 API，不访问网络、不写文件。

输入是非空数组，每项包含非空 `name` 与非负有限数 `durationSeconds`。重复名称表示两次观测，不去重。P95 样本很小时接近最大值，不应用三条记录判断生产服务 SLA。总耗时是观测值求和，不是并行任务完成的墙钟时间。

```sh
npm test
npm pack --ignore-scripts
dsh plugin --profile web add /absolute/path/dsh-book-job-summary-0.1.1.tgz
dsh --profile web --dump-config
```

启动同一个 profile 后，让模型调用 `book_job_summary`，参数 `file_path` 指向样例文件的绝对路径。此版本的路径检查针对 POSIX，未宣称支持 Windows。先检查文件大小不超过 1 MiB，读取后再检查字符数；检查与读取之间存在文件变化窗口，不是内存用量的硬限制。超大文件应换成受限流式读取。

卸载：`dsh plugin --profile web remove dsh-book-job-summary`。本例不依赖安装脚本，不需要 npm 发布账号。运行时真实兼容性见书稿证据，不以单元测试替代宿主加载验证。
