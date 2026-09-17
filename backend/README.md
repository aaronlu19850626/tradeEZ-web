# TradeSync-Web 后端（API v2 联调版）

当前版本用于把 MT5 EA 与服务端打通，已实现：

- 邮箱验证码注册 / 登录（控制台模式或 SMTP）。
- 网页绑定 MT5 账号并生成账号专属 `sk_live_...` 同步 Key。
- MT5 EA 通过 HTTPS 拉取增量同步点、上传成交、品种规格、账户快照和心跳。
- 成交按 `(mt5_login, deal_ticket)` 幂等去重。
- 网页控制台展示账号、心跳、增量同步点、最近成交和按 `position_id` 临时配对的订单。
- SQLite 本地存储，便于当前局域网联调；生产环境再迁移 PostgreSQL。

> 当前需求以 `../docs/API_SPECIFICATION_V2(1).md` 为准。已实现范围与后续差距见 `../docs/API_V2_GAP_ANALYSIS.md`。

## 目录

```text
backend/app/              FastAPI 服务
backend/scripts/          本机 HTTPS、防火墙和联调辅助脚本
backend/data/             本地 SQLite / 控制台验证码（不提交）
backend/certs/            本地开发证书（不提交）
../ea/                    MT5 EA 源码
```

## 1. 初始化

```powershell
cd D:\projects\TradeEZ\EA\TradeSync-Web\backend
py -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

需要重新生成本地 HTTPS 证书时安装开发依赖：

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

## 2. 本地 HTTP 启动

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

控制台：

```text
http://127.0.0.1:8000/dashboard
```

## 3. 局域网 HTTPS 启动

生成证书（脚本会自动加入本机名和当前首选局域网 IP）：

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
powershell -ExecutionPolicy Bypass -File .\scripts\new-lan-cert.ps1
```

也可以显式指定 IP / 机器名：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\new-lan-cert.ps1 -IpAddress 192.168.31.116 -ExtraHost JKLCHEN
```

首次开放防火墙，需要管理员 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\allow-firewall-8443.ps1
```

启动 HTTPS：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-https-lan.ps1
```

本机和局域网访问：

```text
https://127.0.0.1:8443/dashboard
https://<本机局域网IP>:8443/dashboard
```

当前机器曾使用：

```text
https://192.168.31.116:8443/dashboard
```

证书是本地开发证书。远程电脑需要把 `backend/certs/lan-server.cer` 导入“本地计算机 → 受信任的根证书颁发机构”，或在远程电脑以管理员运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-lan-cert.ps1
```

如果局域网 IP 变化，需要重新生成证书并重启服务。

## 4. 邮箱验证码

`.env` 默认：

```env
TRADESYNC_EMAIL_PROVIDER=console
```

控制台模式下验证码输出在后端终端，也会写入本地：

```text
backend/data/dev-codes/latest.json
```

配置 SMTP 后可真实发送邮件，变量见 `.env.example`。

## 5. EA 安装与配置

1. 在网页中用邮箱登录。
2. 绑定 MT5 登录号。
3. 复制生成的 `sk_live_...` Key；Key 只完整展示一次，丢失后可重置。
4. MT5 中打开：**工具 → 选项 → EA 交易 → 允许 WebRequest 到以下 URL**。
5. 添加服务端地址，例如：`https://192.168.31.116:8443`。
6. 编译或加载 `../ea/TradeSyncProbeEA.mq5`。
7. 设置 EA 参数：

```text
Inp_BaseUrl=https://192.168.31.116:8443
Inp_SyncKey=sk_live_...
Inp_HistoryDays=7
Inp_TimerSeconds=3
Inp_BatchSize=500
Inp_SendSymbolSpec=true
Inp_SnapshotIntervalSec=30
Inp_HeartbeatIntervalSec=300
```

EA 启动后会：

1. 请求最后增量同步点。
2. 首次按 `Inp_HistoryDays` 补历史成交；之后按服务端返回的 `last_sync_time` 增量拉取。
3. 使用 5 秒重叠窗口重扫，服务端按成交票号幂等去重。
4. 上传 Market Watch 中可读取的品种规格。
5. 每 30 秒上传账户余额 / 净值 / 保证金快照。
6. 每 5 分钟上传心跳。

日志出现下面内容表示首轮成交同步完成：

```text
[TradeSync] Initial sync completed
```

## 6. API v2 端点

所有 EA 请求都使用：

```http
Content-Type: application/json
Authorization: Bearer sk_live_...
```

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/v1/sync/last_sync_time` | 获取账号最后成交同步点 |
| POST | `/api/v1/ingest/deals` | 批量上传 MT5 成交，最多 1000 笔/批 |
| POST | `/api/v1/ingest/symbols` | 上传品种规格 |
| POST | `/api/v1/ingest/snapshot` | 上传账户资金快照 |
| POST | `/api/v1/sync/heartbeat` | 上传 EA 心跳 |
| GET | `/health` | 健康检查 |

成交响应示例：

```json
{
  "accepted": 2,
  "inserted": 2,
  "duplicates": 0,
  "last_sync_time_updated": 1753082400
}
```

标准错误响应：

```json
{
  "error": {
    "code": "INVALID_SECRET_KEY",
    "message": "The provided secret key is invalid",
    "details": {}
  }
}
```

## 7. 网页和兼容接口

- `POST /api/v1/auth/send-code`
- `POST /api/v1/auth/verify-code`
- `GET  /api/v1/users/me`
- `GET  /api/v1/accounts`
- `POST /api/v1/accounts`
- `POST /api/v1/accounts/{id}/regenerate-key`
- `GET  /api/v1/my/accounts/{id}/deals`
- `GET  /api/v1/my/accounts/{id}/positions`

旧版成交上传路径保留在 `/internal/legacy/ingest/deals`，仅供旧探针兼容。

## 8. 安全说明

- 服务端只保存同步 Key 的 SHA-256 Hash，不保存明文 Key。
- `dev-sync-key-change-me` 只作为本地开发兼容，并且要求账号已在网页绑定；生产环境必须修改或禁用。
- `backend/.env`、SQLite 数据库、证书私钥和 `venv/` 均已通过 `.gitignore` 排除。
- 当前内存限流只适合单进程开发；多进程 / 生产环境应改为 Redis 等共享存储。

## 9. 编译 EA

```powershell
$ea='D:\projects\TradeEZ\EA\TradeSync-Web\ea\TradeSyncProbeEA.mq5'
$log='D:\projects\TradeEZ\EA\TradeSync-Web\ea\compile-probe.log'
Start-Process -FilePath 'C:\Program Files\MetaTrader 5\MetaEditor64.exe' `
  -ArgumentList @('/compile:'+$ea,'/log:'+$log) -Wait -WindowStyle Hidden
Get-Content $log -Raw -Encoding Unicode
```

当前源码编译目标：`0 errors, 0 warnings`。
