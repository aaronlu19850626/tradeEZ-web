# TradeSync 技术设计文档

版本 v1.0 · 2026-07-21

---

## 1. 系统架构

```
MT5 终端(EA SyncModule)
   │  HTTPS POST + Bearer(SyncKey) + HMAC签名 (增量/幂等)
   ▼
[Nginx 反向代理/TLS]
   ▼
[FastAPI 应用]
   ├── auth      注册/登录/JWT
   ├── accounts  绑定/Key管理
   ├── ingest    成交/快照/品种 接收(幂等)
   ├── stats     盈亏/订单/统计查询
   ├── rules     纪律规则与违规
   └── review    复盘标注
        │
        ▼
   PostgreSQL (+TimescaleDB 快照时序)
        ▲
[Worker/定时]
   ├── pairing    deals→positions 配对(成交后异步)
   ├── daily_agg  每日物化 daily_stats
   ├── crawler    金十等财经数据抓取(可降级)
   └── ai_brief   Claude 生成盘前简报
        │
[Next.js 前端] ←── REST API ──┘
```

**核心原则**：EA 只上传**原始事实**（成交、快照、品种规格）。所有统计、胜率、
盈亏比、R 倍数由**服务端重算**。EA 面板算好的值仅作对账参照，不作真相源
（面板值可被重置/自愈；且平仓成交 magic 会被污染，服务端用更可靠口径重做）。

---

## 2. MT5 → Web 同步契约

### 2.1 鉴权

- 本节只保留架构摘要，完整且具约束力的接口契约以仓库根目录 `API_SPECIFICATION_V2.md` v2.1 为准。
- Key 由服务器结合账户号、辅助绑定信息、服务器端秘密和安全随机数生成；EA 将其视为完整、不透明字符串，不生成、不拆分。
- 请求头：
  - `Authorization: Bearer <server-generated-key>`
  - `X-Timestamp: <Unix UTC秒>`
  - `X-Signature: HMAC-SHA256(key, raw_body + timestamp)`（hex 小写）
- 服务端验证账户绑定、吊销状态、HMAC 和 5 分钟防重放窗口。

### 2.2 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/v1/sync/last_sync_time` | 查询最后确认的开仓时间游标（UTC） |
| POST | `/api/v1/ingest/deals` | 批量成交（幂等 upsert） |
| POST | `/api/v1/sync/update_last_sync_time` | 全批上传成功后单独推进开仓时间游标 |
| POST | `/api/v1/ingest/snapshots` | 账户快照（净值曲线） |
| POST | `/api/v1/ingest/symbols` | 品种规格（绑定/变更时） |
| POST | `/api/v1/ingest/heartbeat` | 心跳（更新 last_seen） |

### 2.3 成交上传

```json
POST /api/v1/ingest/deals
{
  "mt5_login": 88973405,
  "server_gmt_off": 0,
  "deals": [{
    "ticket":1010389473, "position_id":1010389473, "order_id":0,
    "symbol":"GOLD#", "entry":0, "type":0, "volume":0.30, "price":4061.81,
    "sl_price":4056.81, "tp_price":0,
    "profit":0, "swap":0, "commission":0,
    "magic":920718, "comment":"TradeEZ-TR",
    "open_time":1753082193, "deal_time":1753082193
  }]
}
```
`entry`: 0=IN 1=OUT 2=INOUT · `type`: MT5 原始枚举值 · 所有时间均为 Unix UTC 秒。

响应（幂等，可安全重发）：
```json
{"accepted":1, "inserted":1, "duplicates":0}
```

成交上传接口不得隐式推进游标。全部批次成功后，客户端再调用
`POST /api/v1/sync/update_last_sync_time`，提交本轮最大的 `open_time`。
查询和采集采用包含式边界 `open_time >= last_sync_time`，同秒记录依靠 ticket 幂等去重。

### 2.4 品种规格

```json
POST /api/v1/ingest/symbols
{"mt5_login":88973405,
 "symbols":[{"name":"GOLD#","digits":2,"point":0.01,
             "tick_value":1.0,"contract_size":100}]}
```
用于服务端算 R 与金额（全品种支持的关键）。

### 2.5 幂等与错误

- 幂等：`INSERT ... ON CONFLICT(account_id,ticket) DO NOTHING`。
- 错误码：`401` Key 无效/吊销 · `422` 校验失败(逐条返回) · `429` 限速。
- positions 由服务端异步配对，EA 不管；EA 靠响应 `server_max_ticket` 推进游标。

---

## 3. EA SyncModule 设计

**硬约束**：`WebRequest()` 同步阻塞，**绝不在 `OnTradeTransaction` 里发网络**，
否则网络慢会卡下单/平仓。当前 EA 统一在 Timer 周期执行增量同步。

### 3.1 新增输入
```
input bool   Inp_EnableSync = false;
input string Inp_ApiBaseURL = "https://api.tradeez.cn";
input string Inp_SecretKey  = "";        // Web 服务器生成的完整密钥
input int    Inp_MaxBatchSize = 100;
```

### 3.2 状态
- 权威游标保存在服务器账户记录中，语义为最后确认的 UTC 开仓时间。
- EA 每轮先查询权威游标；本地缓存只用于面板显示，不代替服务器游标。
- 重传安全性由服务器 `(account_id, ticket)` 唯一约束保证。

### 3.3 流程
```
OnTradeTransaction(trans):
    if trans.type == DEAL_ADD:
        只刷新风控/UI，不发网络

OnInit()/OnTimer():
    cursor = POST /sync/last_sync_time
    if cursor == 0 or query_failed:
        cursor = utc_now - 7 days
    deals = collect(open_time >= cursor)       // 包含边界
    normalize open_time/deal_time to UTC
    for batch in split(deals, Inp_MaxBatchSize):
        POST /ingest/deals
        if failed: stop; do not update cursor
    POST /sync/update_last_sync_time(max(open_time))

    // 另一路:每30秒发快照、每5分钟发心跳
```

### 3.4 用户须知
必须在 MT5「工具→选项→EA交易→允许的 WebRequest URL」加入 API 域名，否则联网被拒。
写进用户手册。

---

## 4. 统计口径（决定"统计准不准"）

把 EA 会话踩过的坑固化进服务端逻辑。

### 4.1 分策略分类 —— 按"开仓成交"判定
- 服务端按 `position_id` 找 IN 成交，用 **IN 成交的 magic** 分类。
- **绝不用平仓成交的 magic**：MT5 全局下单对象 magic 会粘连到平仓成交，
  导致趋势单被误判成剥头皮（EA 已修过此 bug）。
- magic=0 且注释无策略前缀 → manual（手动单）。
- 注释兜底：magic 未命中时用 comment 前缀（TradeEZ-SC/TR）识别。

### 4.2 持仓配对（deals → positions）
- 一个 position_id 下：1 个 IN + N 个 OUT（支持部分平仓）。
- 方向 = IN 成交 type；手数 = IN 总量；平价 = OUT 按量加权平均。
- 持时 = 全平时间 − 开仓时间；净盈亏 = 各 OUT 的 profit+swap+commission 合计。
- stat_day：positions 按平仓时间归日；deals 按成交时间归日。

### 4.3 R 倍数
- 计划风险 1R = `|open_price - sl_price| * tick_value * volume`（用 IN 成交的 SL）。
- `r_multiple = net_pnl / planned_risk`。
- 趋势单用**初始 SL**（后续移损不改 1R 定义）。
- **无 SL → planned_risk=NULL → r_multiple=NULL**，前端显示 N/A，并进纪律违规。

### 4.4 聚合指标（daily_stats）
- 胜率 = wins/trades；盈利因子 = 毛盈利/毛亏损。
- 平均 R = mean(r_multiple)；期望值(R) = 胜率×平均盈利R − 败率×平均亏损R。
- 最大连胜/连亏：按平仓时间排序扫描。
- 每日物化 Worker 生成；含 strategy='all' 汇总行。

### 4.5 统计日边界
- 北京时间 `reset_hour:reset_minute`（默认 4:50）翻日，与 EA 一致。
- 服务端存 UTC；归日时使用账户配置的业务时区与重置时间，不能再次转换已规范化的 UTC 时间戳。

---

## 5. 时区处理

- 存储统一 UTC（`TIMESTAMPTZ`）。
- 归日：按账户配置的北京 4:30 翻日点计算 `stat_day`。
- 展示：前端按用户时区渲染；净值曲线用 UTC 存、本地显示。

---

## 6. AI 盘前简报

- **调度**：每日美盘前，按用户时区换算触发 Worker。
- **数据源（分层，可降级）**：
  1. 行情：MT5 自有 OHLC/ATR（最稳，免费）。
  2. 财经日历：爬虫抓金十等（可插拔）；抓取失败回退到缓存/占位，简报仍出。
  3. 抓取内容仅作 AI 输入，不原样转载展示（合规）。
- **生成**：Claude 输出 基本面(事件清单/预期/影响) + 技术面(趋势/关键价位/区间) +
  结合用户策略的个性化提示。
- **交付**：Web 卡片 + 可选邮件/Telegram。必带免责声明。

---

## 7. 安全与多租户

- 同步 Key：密文存储、可轮换、可吊销、限速；HMAC 防重放。
- 全程 HTTPS；JWT 会话；argon2 密码。
- 租户隔离：每查询强制 `user_id`（考虑 PostgreSQL RLS）。
- 成交只增不改（不可篡改档案）；用户只能改自己的复盘/规则。
- 合规：GDPR 数据删除权、隐私政策、AI 免责。

---

## 8. 目录结构（建议）

```
TradeSync-Web/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/{auth,accounts,ingest,stats,rules,review}.py
│   │   ├── models/        SQLAlchemy 模型
│   │   ├── schemas/       Pydantic
│   │   ├── services/      pairing/stats/crawler/ai_brief
│   │   ├── core/          config/security/db
│   │   └── workers/       celery/apscheduler 任务
│   ├── alembic/           迁移
│   ├── tests/
│   └── requirements.txt
├── frontend/              Next.js
├── ea/                    SyncModule (MQL5, 可选放这里)
├── docker-compose.yml
├── .env.example
└── docs/
```

---

## 9. 落地顺序（P0）

1. FastAPI 骨架 + Alembic 建表（见 DATABASE.md）。
2. auth（注册/登录/JWT）+ accounts（绑定/Key）。
3. **ingest 接口 + 幂等 + 鉴权 + HMAC**（EA/前端都依赖此契约）。
4. pairing 配对 + stats 统计引擎 + daily_agg 物化。
5. EA SyncModule。
6. 前端三页面：每日盈亏 / 订单查询 / 订单统计。
