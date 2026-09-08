# 实测版 0.1 发布记录

2026-09-08 发布至 https://blog.chuncui.icu/deepseek-harness-book/ 。原 `/deepseek-harness-guide/` 保留原有介绍并新增全文与 EPUB 入口。

服务器版本：`/var/www/blog.chuncui.icu/releases/20260908T045927Z`。

发布前原版本：`/var/www/blog.chuncui.icu/releases/20260908T025415Z`，保留可回退。发布先复制原版本，只更新书稿与指南目录，比较其余目录无差异后切换 current 符号链接。未发布本地其他文章改动。

线上正文、EPUB、原创插件 tarball 及所有正文配图均 HTTP200，与本地 SHA256 一致，结果见 `live-check.json`。网页在本地浏览器完成图片与排版检查；线上浏览器连接超时，线上验收使用 HTTPS 内容与哈希核对，不冒称完成线上视觉检查。

站点检查：466个HTML页面，缺标题0、缺资源0、已删除图床引用0、SEO/GEO结构错误0。EPUB ZIP完整性检查通过；没有宣称完成各电子书阅读器的兼容测试。

原始运行目录和凭据未发布。提交前对暂存文件进行凭据精确匹配和 runtime 路径检查，0命中。模板翻译警告来自本机Pandoc缺少zh翻译文件，正文中文和图片生成正常。
