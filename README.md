# TradeSync-Web / TradeEZ-web

新电脑 / Codex 接手请先阅读 [文档入口](docs/README.md)、[迁移与接手指南](docs/00-项目总览/迁移与接手指南.md) 和 [项目文档索引](docs/00-项目总览/项目文档索引.md)。当前状态：交易账户模块与交易记录查询模块的前后端均已落地，下一步是真实数据联调、测试与后续模块开发。

TradeSync-Web 是 TradeEZ 的 MT5 交易数据同步 Web 服务。当前以 [SOP v1.03 新接口说明](<docs/50-连接器与EA/TradeEZ-SOP数据同步接口说明.md>) 为准：UTC 平仓成交时间游标、原始 body HMAC、先保存再提交游标。实现与验收边界见 [对齐记录](docs/50-连接器与EA/SOP契约验收.md)。

## 当前能力

前端（Next.js，`frontend/`）：

- 手机号 / 邮箱验证码登录；未登录访问一律在服务端跳转登录页。
- 总览 `/dashboard/overview`：全周期固定 14 面板与综合评分。
- 交易账户 `/dashboard/account-center`：账户增删改、EA 同步 Key 管理、历史成交导入。
- 交易记录 `/dashboard/trade-center`：按日 / 按周 / 全部三种视图，列选择与 URL 深链持久化。
- AI 中心 `/dashboard/ai-settings`、行情回放 `/dashboard/replay`、图表实验室 `/dashboard/chart-lab`：二期功能的可用入口。

后端（FastAPI，`backend/`）：

- 邮箱验证码注册 / 登录，JWT 会话。
- 网页绑定 MT5 账号并生成账号专属 `sk_live_...` 同步 Key。
- 新 Key 使用服务端密文保存可恢复 HMAC 密钥；数据库不保存明文。
- 账户中心、交易记录查询（`/api/v1/trades` 系列）与用户偏好（`/api/v1/preferences/{namespace}`）接口。
- FastAPI HTTPS 服务，可在局域网通过 `https://<局域网IP>:8443` 访问。
- 独立 API 审计日志模块：只记录接口、账号、结果、数量、游标和耗时，不保存订单明细。
- PostgreSQL 主数据库，本地和局域网联调通过 `TRADESYNC_DATABASE_URL` 指向独立测试库。

MT5 EA v2.1（`connectors/mt5/`）：

- 每个请求携带 Bearer Key、`X-Timestamp`、`X-Signature`。
- HMAC-SHA256 签名原文为 `raw_json_body + timestamp`。
- 成交时间、开仓时间、快照时间统一转换为 Unix UTC 秒。
- `server_gmt_off` 固定传 `0`。
- 先查 `last_sync_time`，再批量上传成交，全部批次成功后单独推进游标。
- 按 OUT 的 `deal_time >= last_sync_time` 选择目标持仓，重复成交按账号和 ticket 幂等。
- 单批最多 1000 条，EA 默认 100 条。
- 支持品种规格、复数快照数组和携带 MT5 服务器时区的心跳。
- MetaEditor 编译目标：0 errors / 0 warnings。

## 最新需求文档

当前接口以 [新说明](<docs/50-连接器与EA/TradeEZ-SOP数据同步接口说明.md>) 为准。以下为旧设计参考，冲突时采用新说明：

- [API 规范 v2.1（历史归档）](<docs/90-历史归档/旧API文档/API规范V2-副本2.md>)
- [技术设计 v1.0 / v2.1 同步契约（历史归档）](<docs/90-历史归档/旧设计说明/设计说明-副本1.md>)

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
frontend/  Next.js 控制台（登录、总览、交易账户、交易记录、AI 中心、行情回放、图表实验室）
backend/   FastAPI 服务、PostgreSQL 数据层、迁移与运维脚本
connectors/ 各平台客户端、探针和协议版本
docs/       按 00~90 编号组织的文档
scripts/   本地与局域网联调辅助脚本
```

## 本地快速启动

后端：

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 填写 TRADESYNC_DATABASE_URL，例如 postgresql://tradeez:***@127.0.0.1:5432/tradeez
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

前端：

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE_URL 指向后端
npm run dev
```

浏览器打开登录页，接口文档与健康检查在后端：

```text
http://127.0.0.1:3000/auth/v2/login   控制台
http://127.0.0.1:8000/docs            OpenAPI 文档
http://127.0.0.1:8000/health          健康检查
```

局域网 HTTPS、EA 安装和完整配置见：[backend/README.md](backend/README.md)。

## 自检

```bash
./scripts/quality/check.sh
```

统一检查会依次执行后端测试、前端 TypeScript、Biome、生产构建和 Playwright。Playwright 需要本地 `3000` 前端和 `8000` 后端已经启动；只做静态门禁时可执行 `SKIP_E2E=1 ./scripts/quality/check.sh`。

单独运行 EA 接口冒烟：

```bash
python backend/scripts/v2_smoke_test.py
```

`v2_smoke_test.py` 使用独立的 `tradesync_smoke` PostgreSQL 数据库（会清空该库的 public schema），覆盖 HMAC 成功/失败、防重放时间窗、403 账号不匹配、成交幂等、同秒边界、两阶段提交、409 游标保护、1000/1001 批次限制、品种、快照和心跳。

## 不提交的本地文件

- Python 虚拟环境。
- `backend/.env`。
- 旧 SQLite 数据库备份、PostgreSQL 测试库数据和本地验证码。
- HTTPS 证书与私钥。
- EA `.ex5`、编译日志和服务运行日志。

当前 PostgreSQL / 内存限流适合第一阶段局域网联调；后续公网生产建议补充共享限流、公网域名和可信 CA 证书。
