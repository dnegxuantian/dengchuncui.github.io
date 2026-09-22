# 本书练习版说明

原作者：kestiny18。上游为 https://github.com/kestiny18/dsh-plugins/tree/9ed3d60d9dd93c21b48211034304686ebcf9c027/dsh-usage ，版本 0.2.5，MIT 许可证；本目录保留上游署名和许可证。

这是本书的本地练习版，不是上游正式发布。没有上传 npm 或连接 Community。

- `0.2.5-book.1`：补充 `stateSchema` 与 `wire`，让官方 DSH 0.1.1-rc.2 可以读取并向 Web 发送 `modelCost`。保留旧的 `schema/view` 供包内已有纯函数接口使用；增加内部状态和客户端值的分别验证。统计缓存版本加一。
- `0.2.5-book.2`：新增输入缓存命中率，分母是未命中输入、缓存写入、缓存读取之和。零输入或有调用缺少用量时显示 `--`。增加计算测试和解释文本。

两个实际安装过的包在 `packages/`。源码对应 book.2。`pnpm-lock.yaml` 是本目录独立安装生成的依赖锁，不是上游整个工作区的锁文件。

独立安装和构建：

```sh
npx --yes pnpm@11.7.0 install --frozen-lockfile --ignore-scripts
npx --yes pnpm@11.7.0 run check
```

本地 DSH 的安装、启动与页面核对见书中第 4.1 节。这里的 `check` 包含类型检查、22 项单测和构建，不代表已经在读者的 DSH 版本上完成集成验证。
