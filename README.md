# TradeSync-Web / TradeEZ-web

新电脑 / Codex 接手请先阅读 [迁移与接手指南](docs/迁移与接手指南.md) 和 [项目文档索引](docs/项目文档索引.md)。当前前端已确认，下一步开发交易账户模块后台接口、真实联调与测试。

TradeSync-Web 是 TradeEZ 的 MT5 交易数据同步 Web 服务。当前以 [SOP v1.03 新接口说明](<docs/TradeEZ-SOP数据同步接口说明.md>) 为准：UTC 平仓成交时间游标、原始 body HMAC、先保存再提交游标。实现与验收边界见 [对齐记录](docs/SOP契约验收.md)。

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
  - 按 OUT 的 `deal_time >= last_sync_time` 选择目标持仓，重复成交按账号和 ticket 幂等。
  - 单批最多 1000 条，EA 默认 100 条。
  - 支持品种规格、复数快照数组和携带 MT5 服务器时区的心跳。
- 独立 API 审计日志模块：只记录接口、账号、结果、数量、游标和耗时，不保存订单明细。
- PostgreSQL 主数据库，本地和局域网联调通过 `TRADESYNC_DATABASE_URL` 指向独立测试库。
- MetaEditor 编译目标：0 errors / 0 warnings。

## 最新需求文档

当前接口以 [新说明](<docs/TradeEZ-SOP数据同步接口说明.md>) 为准。以下为旧设计参考，冲突时采用新说明：

- [API 规范 v2.1](<docs/API规范V2-副本2.md>)
- [技术设计 v1.0 / v2.1 同步契约](<docs/设计说明-副本1.md>)

旧文档和临时握手设计仅用于历史参考，不再作为 EA 对接契约。

## v2.1 核心接口

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/v1/sync/last_sync_time` | 查询最后确认的 OUT 成交 UTC 秒游标 |
| POST | `/api/v1/ingest/deals` | 批量成交入库，最多 1000 条，不推进游标 |
| POST | `/api/v1/sync/update_last_sync_time` | 全部批次成功后推进开仓时间游标 |
| POST | `/api/v1/ingest/symbols` | 上传品种规格 |
| POST | `/api/v1/ingest/snapshots` | 上传账户快照数组 |
| POST | `/api/v1/ingest/heartbeat` | EA 心跳 |
| GET | `/health` | 健康检查 |

## 仓库结构

```text
backend/   FastAPI 服务、网页控制台、PostgreSQL 数据层、HTTPS/测试脚本
ea/        MT5 EA 源码（.ex5 和编译日志不提交）
docs/      PRD、设计、API 规范和部署文档
```

## 本地快速启动

```powershell
cd D:\projects\TradeEZ\EA\TradeSync-Web\backend
py -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
# 编辑 .env，填写 TRADESYNC_DATABASE_URL，例如 postgresql://tradeez:***@127.0.0.1:5432/tradeez
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

最近订单列表显示订单号、止损、止盈、库存费、佣金，并把持仓时间精确到秒；“有效订单”口径为已同步的不同 `position_id` 数量。

控制台：

```text
http://127.0.0.1:8000/dashboard
```

局域网 HTTPS、EA 安装和完整配置见：[backend/README.md](backend/README.md)。

## v2.1 自检

```powershell
cd D:\projects\TradeEZ\EA\TradeSync-Web
.\backend\venv\Scripts\python.exe .\backend\scripts\v2_smoke_test.py
```

该测试使用独立的 `tradesync_smoke` PostgreSQL 数据库（会清空该库的 public schema），覆盖 HMAC 成功/失败、防重放时间窗、403 账号不匹配、成交幂等、同秒边界、两阶段提交、409 游标保护、1000/1001 批次限制、品种、快照和心跳。

## 不提交的本地文件

- Python 虚拟环境。
- `backend/.env`。
- 旧 SQLite 数据库备份、PostgreSQL 测试库数据和本地验证码。
- HTTPS 证书与私钥。
- EA `.ex5`、编译日志和服务运行日志。

当前 PostgreSQL / 内存限流适合第一阶段局域网联调；后续公网生产建议补充共享限流、公网域名和可信 CA 证书。
