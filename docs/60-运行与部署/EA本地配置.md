# 本机 EA 接入

适用范围：MT5 与服务端在同一台 Windows 电脑。远程 MT5 不能使用这里的 127.0.0.1；局域网 HTTPS 启动见 backend/README.md。

## 启动

在项目目录运行 `powershell -ExecutionPolicy Bypass -File .\scripts\local\start-local-preview.ps1`。
脚本启动后台进程，日志分别在 backend、frontend 的 preview.out.log / preview.err.log。
网页和 EA 配置统一使用本机 8000 API；不修改原有 .env.local 局域网配置。
3000 已占用时脚本停止并提示，不擅自终止进程。8000 可复用已运行的健康服务。

## 账号与密钥

打开 http://127.0.0.1:3000/dashboard/accounts，绑定 MT5 当前登录号和券商服务器名。
完整密钥只在创建或重置时显示；用已保存的完整 sk_live_... 值，不能用列表前缀或网页登录 Token。
重置会使旧密钥立即失效，并要求所有使用该账号密钥的 EA 更新配置。

## 主 EA：tradeEZ-EASOP/tradeEZ.mq5

在“数据同步 Data Sync”参数组填写：

```text
Inp_EnableSync=true
Inp_ApiBaseURL=http://127.0.0.1:8000
Inp_SecretKey=<该账号的完整 sk_live_... 密钥>
Inp_SyncIntervalMin=5
Inp_RequestTimeoutMS=800
Inp_MaxBatchSize=100
Inp_DebugSync=true
```

不要附加 /api/v1、/dashboard 或末尾斜杠；主 EA 会自行追加接口路径。
EA 从终端读取 MT5 登录号；本版心跳不上传券商服务器、时区和币种，请在网页绑定时填写已知信息。不要假定币种为 USD。
常规定时同步等待全账户空仓、未编辑价格且界面空闲；有持仓时可手动确认后同步。输入超时实际被限制为 200–800ms。Inp_AlignIntervalHours 尚未接入校准任务。
在 MT5“工具 → 选项 → EA 交易”允许 WebRequest 并添加 http://127.0.0.1:8000。

## 独立探针：connectors/mt5/probe/TradeSyncProbeEA.mq5

前三个参数和 MaxBatchSize 相同；其他参数使用：

```text
Inp_HistoryDays=7
Inp_TimerSeconds=3
Inp_SendSymbolSpec=true
Inp_SnapshotIntervalSec=30
Inp_HeartbeatIntervalSec=300
```

探针与主 EA 的参数名不同，不要把两组参数混填。探针已改为平仓游标，需要重新编译使用；不要使用仍按开仓游标运行的旧 ex5。初次验证使用一个同步实例。

## 验收

1. 账号保持启用；配置密钥对应的 MT5 登录号必须与终端一致。
2. 重新加载 EA，检查“专家”日志是否出现 HTTP 200。401 检查密钥；签名时间错误检查系统时钟；WebRequest 失败检查服务和白名单。
3. 网页账号的“最近连接”更新；有历史成交时，原始成交列表出现记录。
4. 同步日志出现已确认轮次；无批次标识的旧版 EA 显示“暂无批次记录”，不代表未收到数据。

本机预览仅监听 127.0.0.1。当前配置不代表公网或跨电脑访问已部署完成。
