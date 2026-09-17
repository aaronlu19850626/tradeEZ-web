# TradeSync-Web

TradeSync-Web 是 TradeEZ 的 MT5 交易数据同步 Web 服务。当前仓库处于 **API v2 局域网联调阶段**：先完成 EA 与服务端的安全通信、成交增量同步、账户快照、品种规格、心跳和网页账号配置。

## 当前已具备

- 邮箱验证码注册 / 登录。
- 网页绑定 MT5 账号并生成 `sk_live_...` 同步 Key。
- FastAPI HTTPS 服务，可监听局域网地址。
- MT5 EA v2：
  - 获取 `last_sync_time`
  - 首次历史成交补传
  - 后续成交增量同步
  - 成交票号幂等去重
  - 品种规格上传
  - 账户资金快照上传
  - EA 心跳上传
- SQLite 本地库和网页连接控制台。
- MetaEditor 编译通过：`TradeSyncProbeEA.mq5` 当前为 0 errors / 0 warnings。

## 仓库结构

```text
backend/   FastAPI 服务、网页控制台、脚本、SQLite 数据层
ea/        MT5 EA 源码（编译产物不提交）
docs/      PRD、服务设计、API v2 规范、差距分析和部署文档
```

## 快速开始

```powershell
cd backend
py -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

打开：

```text
http://127.0.0.1:8000/dashboard
```

局域网 HTTPS、EA 参数和 API 细节见：[backend/README.md](backend/README.md)。

## API v2 规范

需求以该文件为准：

- [docs/API_SPECIFICATION_V2(1).md](docs/API_SPECIFICATION_V2(1).md)
- [docs/API_V2_GAP_ANALYSIS.md](docs/API_V2_GAP_ANALYSIS.md)

核心 EA 接口：

- `POST /api/v1/sync/last_sync_time`
- `POST /api/v1/ingest/deals`
- `POST /api/v1/ingest/symbols`
- `POST /api/v1/ingest/snapshot`
- `POST /api/v1/sync/heartbeat`

## 本地安全与提交排除

以下内容不会提交到 GitHub：

- Python 虚拟环境
- `.env`
- SQLite 数据库和验证码文件
- HTTPS 私钥 / 证书
- EA `.ex5` 与编译日志

生产路线仍建议迁移到 PostgreSQL、公网域名和可信 CA 证书，并把内存限流替换为共享限流存储。
