---
title: "数据源连通不等于同步链路可用"
date: "2021-01-18 20:50:54"
updated: "2021-01-18 20:50:54"
categories:
- "数据集成"
tags:
- "数据源"
- "连接池"
- "诊断"
description: "页面上的“测试连接成功”只能证明一次握手完成，不能证明账号能读目标表，更不能证明长任务不会断。 连接测试不是一个绿色图标，而是一组能被复查的证据。"
cover: /images/timeline/datasource-connectivity-check.svg
top_img: /images/timeline/datasource-connectivity-check.svg
permalink: /2021/01/18/datasource-connectivity-check/
comments: false
---

<!-- generated: timeline-backfill -->

页面上的“测试连接成功”只能证明一次握手完成，不能证明账号能读目标表，更不能证明长任务不会断。

![数据源连通不等于同步链路可用](/images/timeline/datasource-connectivity-check.svg)

## 别急着换组件

连通性检查应拆成 DNS、端口、认证、权限、查询和持续读取六层，失败信息保留到具体层级。

用 `select 1` 验证不到字符集、时区、游标和大结果集问题，至少要读取一张真实结构的轻量样本表。

## 实施顺序

连接参数进入任务实例后要做脱敏快照，避免页面配置已修改而历史任务无法还原。

连接测试不是一个绿色图标，而是一组能被复查的证据。

### 延伸资料

- [Alibaba DataX](https://github.com/alibaba/DataX)
