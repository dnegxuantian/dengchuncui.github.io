# 文档标题转网址片段

这是书中的练习项目，含故意保留的缺陷，不是真实线上事故。
实现`toSlug(title)`，将文档标题变成ASCII网址片段：

- 转小写，去掉拉丁字母的组合音调符号，例如Café变成cafe。
- 非a-z、0-9的连续字符合并成一个连字符，去掉两端连字符。
- 空结果抛出RangeError；参数不是字符串时抛出TypeError。
- 只修改src/slug.mjs，不修改测试。

例：`  Café & API: v2  `应成为`cafe-api-v2`。
