# TradeSync-Web / TradeEZ-web

TradeSync-Web 是 TradeEZ 的 MT5 交易数据同步 Web 服务。当前阶段以 **API v2.1（UTC 开仓时间游标 / HMAC / 两阶段提交）** 为准，先打通 EA 与服务端的安全通信、成交同步、品种规格、账户快照和心跳。

## 当前能力

- 邮箱验证码注册 / 登录，JWT 会话。
- 网页绑定 MT5 账号并生成账号专属 `sk_live_...` 同步 Key。
- 新 Key 使用服务端密文保存可恢复 HMAC 密钥；数据库不保存明文。
- FastAPI HTTPS 服务，可在局域网通过 `https://<局域网IP>:8443` 访问。
- MT5 EA v2.1：
  - 每个请求携带 Bearer Key、`X-Timestamp`、`X-Signature`。
  - HMAC-SHA256 签名原文为 `raw_json_body + timestamp`。
  - 成交时间、开仓时间、快照时间统一转换为 Unix UTC 秒。
  - `server_gmt_off` 固定传 `0`。
  - 先查 `last_sync_time`，再批量上传成交，全部批次成功后单独推进游标。
  - 使用包含式边界 `open_time >= last_sync_time`，重复成交按 ticket 幂等。
  - 单批最多 1000 条，EA 默认 100 条。
  - 支持品种规格、复数快照数组和心跳。
- SQLite 本地库和网页连接控制台。
- MetaEditor 编译目标：0 errors / 0 warnings。

## 最新需求文档

以以下两份最新文档为准：

- [API 规范 v2.1](<docs/API_SPECIFICATION_V2(2).md>)
- [技术设计 v1.0 / v2.1 同步契约](<docs/DESIGN(1).md>)

旧文档和临时握手设计仅用于历史参考，不再作为 EA 对接契约。

## v2.1 核心接口

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/v1/sync/last_sync_time` | 查询最后确认的 UTC 开仓时间游标 |
| POST | `/api/v1/ingest/deals` | 批量成交入库，最多 1000 条，不推进游标 |
| POST | `/api/v1/sync/update_last_sync_time` | 全部批次成功后推进开仓时间游标 |
| POST | `/api/v1/ingest/symbols` | 上传品种规格 |
| POST | `/api/v1/ingest/snapshots` | 上传账户快照数组 |
| POST | `/api/v1/ingest/heartbeat` | EA 心跳 |
| GET | `/health` | 健康检查 |

## 仓库结构

```text
backend/   FastAPI 服务、网页控制台、SQLite 数据层、HTTPS/测试脚本
ea/        MT5 EA 源码（.ex5 和编译日志不提交）
docs/      PRD、设计、API 规范和部署文档
```

## 本地快速启动

```powershell
cd D:\projects\TradeEZ\EA\TradeSync-Webackend
py -m venv venv
.env\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
.env\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

控制台：

```text
http://127.0.0.1:8000/dashboard
```

局域网 HTTPS、EA 安装和完整配置见：[backend/README.md](backend/README.md)。

## v2.1 自检

```powershell
cd D:\projects\TradeEZ\EA\TradeSync-Web
.ackendenv\Scripts\python.exe .ackend\scripts2_smoke_test.py
```

该测试使用临时 SQLite 数据库，覆盖 HMAC 成功/失败、防重放时间窗、403 账号不匹配、成交幂等、同秒边界、两阶段提交、409 游标保护、1000/1001 批次限制、品种、快照和心跳。

## 不提交的本地文件

- Python 虚拟环境。
- `backend/.env`。
- SQLite 数据库、WAL/SHM 和本地验证码。
- HTTPS 证书与私钥。
- EA `.ex5`、编译日志和服务运行日志。

当前 SQLite / 内存限流适合局域网联调；生产环境建议迁移 PostgreSQL、共享限流、公网域名和可信 CA 证书。
