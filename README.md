# 纯粹博客

邓纯粹的个人技术博客。源码使用 [Hexo](https://hexo.io/) 生成，主题基于 [Butterfly](https://butterfly.js.org/)，线上域名为 `blog.chuncui.icu`。

## 本地开发

需要 Node.js 20 或更高版本。

```bash
npm ci
npm run dev
```

浏览器打开 <http://127.0.0.1:4000/>。

## 构建与校验

```bash
npm run build
npm run check
```

构建结果写入 `public/`。校验脚本会检查文章数量、页面标题、本地资源和已经失效的旧图床引用。

## 仓库分支

- `main`：Hexo 源码、文章、样式和部署配置，是唯一需要日常编辑的分支。
- `public`：Hexo 生成的静态网站，用作 GitHub Pages/静态产物备份，不应直接编辑。

推送 `main` 后，GitHub Actions 会构建、校验并更新 `public` 分支。

## 发布到服务器

发布脚本采用版本目录和 `current` 软链接，切换发布版本是原子操作，旧版本保留在服务器上以便回滚：

```bash
./deploy/deploy.sh root@106.14.34.44
```

Nginx 模板见 `deploy/nginx-blog.conf`。首次部署需要在服务器配置 Nginx 和 HTTPS；之后只需重新运行发布脚本。

## 旧站图片说明

旧站有一批正文图片来自已经删除的 OSS 存储桶，原始文件无法从线上取回。迁移脚本没有继续留下坏链，而是用本地占位组件保留原图 URL 和文章上下文，便于以后拿到备份时逐张恢复。完整清单见 `data/legacy-images.json`。

如需从旧的静态站重新生成 Markdown：

```bash
npm run recover:legacy
```
