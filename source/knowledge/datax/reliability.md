---
wiki: datax-engineering
title: 稳定性边界
permalink: /knowledge/datax/reliability/
description: DataX 任务重试、Writer 幂等、脏数据阈值和数据源预检的工程边界。
date: 2026-09-02 15:32:00
updated: 2026-09-02 15:32:00
robots: index,follow
sitemap: true
comments: false
---

## 三个容易被平台界面掩盖的问题

- {% post_link 2020-12-19-datax-task-retry-boundary "DataX 任务重试为什么会放大故障" %}
- {% post_link 2021-01-07-datax-dirty-data-contract "DataX 脏数据阈值的反直觉细节" %}
- {% post_link 2021-01-18-datax-datasource-precheck "测试连接成功为什么任务仍会失败" %}

重试不是单纯的可用性开关。Task 重新执行意味着 Writer 必须有明确的幂等策略，否则短暂网络故障可能被放大成重复写入。

脏数据也不能只看日志打印条数。日志采样、条数阈值和比例阈值是不同层次的配置，平台需要把最终生效规则展示出来。

“测试连接成功”只证明一次短连接成立。真正的发布前检查还要覆盖查询权限、切分键、目标表写权限以及 `preSql`、`postSql` 的执行条件。
