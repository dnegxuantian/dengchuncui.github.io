---
wiki: lakehouse-architecture
title: 维护与治理
permalink: /knowledge/lakehouse/maintenance-and-governance/
description: 湖仓表 Compaction、元数据体检、快照过期、孤儿文件清理和维护任务 SLA。
date: 2026-09-02 15:35:00
updated: 2026-09-02 15:35:00
robots: index,follow
sitemap: true
comments: false
---

## 从定时脚本转向持续维护

- {% post_link 2022-05-14-compaction-as-service "Compaction 为什么要做成持续服务" %}
- {% post_link 2022-09-15-iceberg-operations-loop "Iceberg 接入生产后，真正缺的是表级运维闭环" %}
- {% post_link 2026-05-18-table-maintenance-sla "表维护任务为什么也要进入 SLA" %}

固定时间跑一次全表 Compaction，只解决了动作调度，没有解决候选选择、资源预算、并发隔离和结果验收。

更稳妥的方式是从 metadata tables 读取健康信号，为不同表设置维护目标，再记录每次重写、过期和删除产生的提交证据。维护任务本身也要有延迟、成功率、积压量和资源成本指标。
