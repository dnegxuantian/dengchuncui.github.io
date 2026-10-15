# DSH 主备模型切换练习

本书原创插件，安装到官方 DSH 0.1.1-rc.2 的独立 Profile 中。Node 使用 ^22.19.0 或 >=24。

主模型是 deepseek-v4-pro，备用是 deepseek-v4-flash，均通过 DSH 的 deepseek-official Adapter 调用。两者属于同一家服务商，本例不能抵御整个服务商或共同网络出口的故障。

## 文件

- index.js：Model Adapter 注册、共同能力声明、逐段转发、错误判断和切换日志。
- cordis.patch.yml：插件配置与默认模型。provider 是本插件注册的路由名；primary/fallback 的 provider/model 指向已经注册的模型。
- index.test.js：纯逻辑测试，不冒充 DSH 集成。
- fault-proxy.mjs、proxy.patch.yml：仅用于本地练习的 HTTP 故障注入，正式使用不加载 proxy.patch.yml。

## 安装与使用

在插件目录执行 `node --test index.test.js`，通过后执行 `npm pack --ignore-scripts`。
指定独立 DSH_HOME，执行 `dsh plugin --profile web add /绝对路径/dsh-book-model-switch-0.1.1.tgz`。
按官方 DSH 模型设置配置 DeepSeek 凭据；本插件不保存或处理密钥。启动 Web Profile，在模型选择器选择“主模型 → 备用模型”。

需要注入故障时，另开终端执行 `node fault-proxy.mjs`；DSH 启动增加 `--patch /绝对路径/proxy.patch.yml`。代理只监听 127.0.0.1:3095，上游固定为 https://api.deepseek.com/chat/completions。不要拿真实业务敏感数据测试，不向其他设备开放端口。

```sh
curl -sS -X POST http://127.0.0.1:3095/mode \
  -H 'Content-Type: application/json' --data '{"mode":"primary-503"}'
```

模式：normal 正常转发；primary-503/401/400 在主模型回答前注入对应 HTTP 错误；both-503 对两个模型均返回 503；partial 转发真实上游直到首个正文片段后断开；wait 挂起主请求供用户点击 DSH 停止按钮。每次模式变更影响之后开始的请求，已有请求保留开始时的模式。

任务可使用纯文本发布说明练习，不执行工具：

> 把下面的变更整理成面向用户的三条发布说明，不调用工具，不补充不存在的功能：修复登录过期后重复跳转；新增 CSV 导出；旧版配置仍可使用。

## 切换规则

只有主模型未向 DSH 转发任何非 finish 片段、请求未取消、失败代码在 switchCodes 中时才会尝试备用。AUTH、MISSING_CREDENTIAL、INVALID_REQUEST、ABORTED 不切换。备用失败直接结束，没有第三次请求。

文字、思考、工具调用、block-start、usage 任意一项已转发，均禁止切换。这里故意保守，避免拼接两次回答和错误累计统计。保留原请求的 messages、system、tools、stop、signal 和推理等级，不通过删除参数使备用请求勉强成功。外围 DSH 重试次数为零，防止重试插件重放整个主备过程。

上下文窗口、输入类型和推理等级使用两个模型已声明能力的交集；本例要求两端均报告上下文，并支持 defaultEffort。不是跨任意厂商的通用兼容器。模型专有 replayState 不穿过本插件转发；会话仍显示逻辑路由 book-switch/auto，具体尝试的模型记在 DSH_HOME/model-switch.jsonl。

日志只含时间、决策 ID、会话 ID、模型、结果和错误码，不含密钥或完整请求。它不是服务商账单：尚未向 DSH 输出的失败请求，也可能已在服务商侧产生用量。对外报价或完整费用统计需要另外核对服务商记录。

## 修改

切换错误清单、主备模型、输出上限和默认推理等级在 cordis.patch.yml 的 config 中修改。先检查两端支持所选请求参数，再递增包版本、打包、重新安装并复测正常、失败、取消和部分输出路径。保留“输出后不切换”及“取消不调用备用”的规则。

本目录代码采用 MIT；官方 DSH 及依赖许可证由各自软件包提供。当前仅在书稿本地环境使用，未发布 npm。
