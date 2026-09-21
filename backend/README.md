# TradeSync-Web 后端（API v2.1 联调版）

当前版本按 [SOP v1.03 新接口说明](<../docs/交易与EA/TradeEZ-SOP数据同步接口说明.md>) 对齐：**UTC 平仓成交时间游标、原始 body HMAC、成交入库与游标推进两阶段提交**。具体约定和验证边界见 [对齐记录](../docs/交易与EA/SOP契约验收.md)。以下旧版接口文档仅作历史参考。

> 权威接口文档：[../docs/API与数据/API规范V2-副本2.md](../docs/API与数据/API规范V2-副本2.md)
> 技术设计：[../docs/模块设计/设计说明-副本1.md](../docs/模块设计/设计说明-副本1.md)

## 已实现

- 邮箱验证码注册 / 登录（控制台模式或 SMTP）。
- 网页绑定 MT5 账号并生成账号专属 `sk_live_...` 同步 Key。
- 新 Key 保存 SHA-256 Hash 用于 Bearer 校验，并保存 Fernet 密文用于服务端计算 HMAC；不保存明文。
- EA 请求头校验：
  - `Authorization: Bearer <完整 sk_live Key>`
  - `X-Timestamp: <Unix UTC 秒>`
  - `X-Signature: HMAC_SHA256(secret, raw_body + timestamp)` 十六进制小写
  - 时间戳允许误差 300 秒。
- 成交按 `(account_login, ticket)` 幂等，重复上传返回 `duplicates`。
- 成交上传只入库，不推进 `last_sync_time`。
- 所有批次成功后，EA 单独调用游标更新接口。
- 游标只允许单调推进；目标时间必须已有服务端接收的 OUT 成交 `deal_time`，否则返回 `409 CURSOR_AHEAD_OF_DATA`。
- 品种规格、账户快照数组、EA 参数配置快照、心跳均使用 v2.1 新路径；心跳额外携带 MT5 服务器时区作为展示元数据。
- 独立 API 审计日志模块 `app/api_logs.py`：记录接口、账号、结果、订单数量、游标和耗时，不保存订单明细、Key、验证码或令牌。
- 控制台有效订单数量按不同 `position_id` 统计；订单列表显示订单号、止损、止盈、库存费、佣金和秒级持仓时间。
- PostgreSQL 18 主存储；本地联调建议使用独立的 `tradesync_test` / `tradesync_smoke` 数据库，不能直接指向生产库。

## 目录

```text
backend/app/              FastAPI 服务、网页控制台、数据模型
backend/scripts/          HTTPS、防火墙、v2.1 自检等脚本
backend/data/             旧 SQLite 迁移源和备份（新运行时不再使用）
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

请在 `.env` 中设置数据库和强随机值：

```env
TRADESYNC_DATABASE_URL=postgresql://tradeez:<password>@127.0.0.1:5432/tradeez
TRADESYNC_AUTH_SECRET=<long-random-secret>
TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET=<another-long-random-secret>
```

注意：更换 `TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET` 后，旧密文 Key 无法解密，需要在网页重置同步 Key。

## 2. 本地 HTTP 启动

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

控制台：

```text
http://127.0.0.1:8000/dashboard
```

## 3. PostgreSQL 维护

```powershell
# 连通性、版本和外键一致性检查
.\venv\Scripts\python.exe scripts\check_database.py --quick

# 自定义格式在线备份，目标文件不能已存在
.\venv\Scripts\python.exe scripts\backup_database.py backups\tradesync-20260919.dump

# 从旧 SQLite 一次性迁移（会自动先备份 SQLite；PG 已有数据时需显式加 --truncate-target）
.\venv\Scripts\python.exe scripts\migrate_sqlite_to_pg.py --sqlite data\tradesync.db

# 恢复会 DROP/CREATE 目标数据库，必须显式确认
.\venv\Scripts\python.exe scripts\restore_database.py backups\tradesync-20260919.dump --url "$env:TRADESYNC_DATABASE_URL" --yes
```

生产环境 PostgreSQL 只监听 `127.0.0.1:5432`；远程迁移测试结束后应立即关闭公网 5432。备份和恢复需要与服务器大版本兼容的 `pg_dump` / `pg_restore`（PostgreSQL 18 使用 18 版客户端）。

## 4. 局域网 HTTPS 启动

生成证书（脚本会自动加入本机名和当前首选局域网 IP）：

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
powershell -ExecutionPolicy Bypass -File .\scripts
ew-lan-cert.ps1
```

显式指定 IP / 机器名：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts
ew-lan-cert.ps1 -IpAddress 192.168.31.116 -ExtraHost JKLCHEN
```

首次开放防火墙，需要管理员 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\allow-firewall-8443.ps1
```

启动 HTTPS：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-https-lan.ps1
```

访问：

```text
https://127.0.0.1:8443/dashboard
https://192.168.31.116:8443/dashboard
https://192.168.31.116:8443/health
```

本地开发证书需要被远程电脑信任。可把 `backend/certs/lan-server.cer` 导入“本地计算机 → 受信任的根证书颁发机构”，或在远程电脑运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-lan-cert.ps1
```

局域网 IP 变化后需要重新生成证书并重启服务。

## 4. EA 安装

1. 在网页中用邮箱登录。
2. 绑定 MT5 登录号。
3. 复制生成的完整 `sk_live_...` Key；Key 只完整展示一次，丢失后可重置。
4. MT5 中打开：**工具 → 选项 → EA 交易 → 允许 WebRequest 到以下 URL**。
5. 添加服务端地址，例如：`https://192.168.31.116:8443`。

MT5 关闭时也可以用脚本备份并修改白名单：

```powershell
cd D:\projects\TradeEZ\EA\TradeSync-Web
powershell -ExecutionPolicy Bypass -File .\ea\enable_mt5_webrequest.ps1
```

编译 EA：

```powershell
$ea='D:\projects\TradeEZ\EA\TradeSync-Web\ea\TradeSyncProbeEA.mq5'
$log='D:\projects\TradeEZ\EA\TradeSync-Web\ea\compile-probe.log'
Start-Process -FilePath 'C:\Program Files\MetaTrader 5\MetaEditor64.exe' `
  -ArgumentList @('/compile:'+$ea,'/log:'+$log) -Wait -WindowStyle Hidden
Get-Content $log -Raw -Encoding Unicode
```

关闭 MT5 后可安装到 Navigator：

```powershell
powershell -ExecutionPolicy Bypass -File .\ea\install_to_mt5.ps1
```

不要覆盖已有主策略 `tradeEZ.mq5`。

## 5. EA 参数

网页控制台可复制以下参数：

```text
Inp_EnableSync=true
Inp_ApiBaseURL=https://192.168.31.116:8443
Inp_SecretKey=sk_live_...
Inp_MaxBatchSize=100
Inp_HistoryDays=7
Inp_TimerSeconds=3
Inp_SendSymbolSpec=true
Inp_SnapshotIntervalSec=30
Inp_HeartbeatIntervalSec=300
```

EA Timer 周期执行：

1. 查询 `/sync/last_sync_time`。
2. 游标为 0 或查询失败时，本地按最近 7 天兜底。
3. 将 MT5 服务器时间成交转换为 UTC；`open_time` 取同一 `position_id` 最早 IN/INOUT 成交时间。
4. 使用包含式边界 `open_time >= last_sync_time`。
5. 按每批最多 `Inp_MaxBatchSize` 调用 `/ingest/deals`。
6. 任一批失败则停止，不推进游标。
7. 所有批次成功且本轮有成交时，用本轮最大 `open_time` 调用 `/sync/update_last_sync_time`。
8. 初始化后上传 EA 参数配置快照；之后每小时上传一次，配置未变化时服务端幂等处理。
9. 定期上传品种规格、账户快照和心跳。

网络请求只在 Timer 中发生，不在 `OnTradeTransaction` 中阻塞交易。

## 6. v2.1 接口

所有 EA 请求：

```http
Content-Type: application/json
Authorization: Bearer sk_live_...
X-Timestamp: 1789632000
X-Signature: <lowercase-hex-hmac-sha256>
```

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/sync/last_sync_time` | 获取最后确认的 UTC 开仓时间游标 |
| POST | `/api/v1/ingest/deals` | 成交入库，1～1000 条/批，不推进游标 |
| POST | `/api/v1/sync/update_last_sync_time` | 全部批次成功后推进游标 |
| POST | `/api/v1/ingest/symbols` | 上传品种规格 |
| POST | `/api/v1/ingest/snapshots` | 上传账户快照数组 |
| POST | `/api/v1/ingest/settings` | 上传 EA 参数配置快照 |
| POST | `/api/v1/ingest/heartbeat` | 心跳，可携带展示用 MT5 时区 |

成交响应：

```json
{"accepted":2,"inserted":2,"duplicates":0}
```

标准错误：

```json
{
  "error": {
    "code": "SIGNATURE_MISMATCH",
    "message": "Request signature does not match",
    "details": {}
  }
}
```

## 7. 网页和管理接口

- `POST /api/v1/auth/send-code`
- `POST /api/v1/auth/verify-code`
- `GET  /api/v1/users/me`
- `GET  /api/v1/accounts`
- `POST /api/v1/accounts`
- `POST /api/v1/accounts/{id}/regenerate-key`
- `GET  /api/v1/my/accounts/{id}/deals`
- `GET  /api/v1/my/accounts/{id}/positions`
- `GET  /api/v1/my/accounts/{id}/settings?limit=20`
- `GET  /api/v1/my/api-logs?limit=100&mt5_login=<login>&success=<true|false>`

旧版探针路径保留在 `/internal/legacy/...`，不作为新 EA 对接路径。

## 8. 自检

```powershell
cd D:\projects\TradeEZ\EA\TradeSync-Web
.\backend\venv\Scripts\python.exe .\backend\scripts\v2_smoke_test.py
```

覆盖：

- 完整 Key 访问绑定账号。
- Key 与账号不匹配返回 403。
- HMAC 成功、错误签名、篡改 body、过期时间戳返回 401。
- 初始游标为 0，成交上传后游标不变。
- 重复 ticket 计入 `duplicates`。
- 同秒不同 ticket 不会漏单。
- 未接收的 `open_time` 推进游标返回 409。
- 游标不倒退。
- UTC 时间原样存储。
- 无效记录整批失败。
- 1001 条拒绝、1000 条成功。
- symbols、snapshots、settings、heartbeat 可用。
- settings 相同快照幂等；不同配置一小时内仅允许保存一次。

## 9. 兼容和安全说明

- 新创建 / 重置的 Key 强制 HMAC。
- v2.1 之前创建的旧 Key 没有可恢复密文，过渡期只允许 Bearer；请在网页重置 Key 后启用完整 HMAC。
- 如果加密密文无法解密，服务端会失败关闭并提示检查加密密钥或轮换 Key。
- `dev-sync-key-change-me` 只作为本地开发兼容，不作为 EA 正式配置。
- `.env`、旧 SQLite 数据/备份、证书私钥、`venv/`、日志均不提交。
- 当前内存限流只适合单进程开发；多进程 / 生产环境应使用共享限流存储。
