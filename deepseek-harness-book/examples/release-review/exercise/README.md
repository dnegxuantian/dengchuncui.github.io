# Release Lens Demo

这是书中的发布审查练习项目，不是已经发布到 npm 的软件。不需要联网安装，也不要尝试发布。

## 安装与运行

目标平台需要 Node.js 22 或更高版本。发布后的安装命令预计是：

```sh
npm install --global release-lens-demo@0.3.0
release-lens config.example.json
```

复制配置示例后，修改自己的服务地址。CLI 当前只校验配置并打印目标，不会连接该地址。

## 开发与测试

```sh
npm run test:unit
```

## 许可证

本项目采用 MIT 许可证，许可证文件随发布包提供。
