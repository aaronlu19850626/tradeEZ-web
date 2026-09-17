# TradeSync API v2.0 现状差距检查

检查日期：2026-09-17  
依据文档：`docs/API_SPECIFICATION_V2(1).md`  
当前检查对象：本地 FastAPI 最小联调版、连接控制台、`TradeSyncProbeEA`

---

## 1. 总结论

当前系统**还不兼容 API v2.0**。

已经具备的是 v1 探针能力：

- 邮箱验证码登录；
- 网页绑定 MT5 账号；
- 账号专属同步 Key；
- 旧格式成交上传；
- 旧格式心跳；
- 成交幂等去重；
- 简单订单配对和网页展示。

v2.0 要求的是“**服务器维护增量同步时间，EA 根据服务器时间增量拉取成交**”的架构。当前 EA 仍按本地 `lastTicket` 补发，服务端也没有 `last_sync_time`。

实际请求验证结果：

| v2 接口 | 当前结果 |
|---|---:|
| `POST /api/v1/sync/last_sync_time` | 404，未实现 |
| `POST /api/v1/ingest/deals`（v2 JSON） | 422，字段格式不兼容 |
| `POST /api/v1/ingest/symbols` | 404，未实现 |
| `POST /api/v1/ingest/snapshot` | 404，未实现 |
| `POST /api/v1/sync/heartbeat` | 404，未实现 |

当前只有旧接口：

- `POST /api/v1/ingest/deals`
- `POST /api/v1/ingest/heartbeat`

---

## 2. 端点逐项对照

| v2 能力 | v2 要求 | 当前状态 | 结论 |
|---|---|---|---|
| 获取最后同步时间 | `POST /api/v1/sync/last_sync_time` | 无此接口 | 不兼容 |
| 上传成交 | `POST /api/v1/ingest/deals` | 路径存在，但请求/响应字段不同 | 部分兼容 |
| 上传品种规格 | `POST /api/v1/ingest/symbols` | 无此接口、无 symbols 表 | 不兼容 |
| 上传账户快照 | `POST /api/v1/ingest/snapshot` | 无此接口、无 snapshots 表 | 不兼容 |
| 心跳 | `POST /api/v1/sync/heartbeat` | 当前是 `/api/v1/ingest/heartbeat`，字段也不同 | 不兼容 |

---

## 3. 成交接口差距

### 3.1 请求字段不一致

v2 使用字符串枚举：

```json
{
  "deal_ticket": 1234567890,
  "order_ticket": 9876543210,
  "position_id": 1122334455,
  "symbol": "XAUUSD",
  "deal_type": "BUY",
  "entry_type": "IN",
  "sl": 2040.0,
  "tp": 2060.0
}
```

当前接口使用数字枚举：

```json
{
  "ticket": 1234567890,
  "order_id": 9876543210,
  "position_id": 1122334455,
  "symbol": "XAUUSD",
  "type": 0,
  "entry": 0,
  "sl_price": 2040.0,
  "tp_price": 2060.0
}
```

字段映射：

| v2 字段 | 当前字段 | 状态 |
|---|---|---|
| `deal_ticket` | `ticket` | 不一致 |
| `order_ticket` | `order_id` | 不一致 |
| `deal_type` | `type`（0/1） | 不一致 |
| `entry_type` | `entry`（0/1/2） | 不一致 |
| `sl` | `sl_price` | 不一致 |
| `tp` | `tp_price` | 不一致 |
| 其他核心字段 | 基本存在 | 部分一致 |

### 3.2 增量同步字段缺失

v2 要求：

```json
{
  "mt5_login": 88973405,
  "server_gmt_off": 10800,
  "last_deal_time": 1753082400,
  "deals": []
}
```

当前没有：

- `last_deal_time` 请求校验；
- `accounts.last_sync_time` 字段；
- 上传成功后更新最后同步时间；
- EA 启动时从服务器查询最后同步时间。

### 3.3 批次限制不一致

- v2：最多 1000 笔/批。
- 当前：最多 500 笔/批。

需要改成 1000。

### 3.4 响应格式不一致

v2 要求：

```json
{
  "accepted": 2,
  "inserted": 2,
  "duplicates": 0,
  "last_sync_time_updated": 1753082400
}
```

当前返回：

```json
{
  "account_login": 88973405,
  "accepted": 2,
  "duplicated": 2,
  "rejected": 0,
  "max_ticket": 910000002,
  "items": []
}
```

差距：

| v2 字段 | 当前字段 |
|---|---|
| `inserted` | 无 |
| `duplicates` | `duplicated` |
| `last_sync_time_updated` | 无 |
| 无逐笔 items | 当前有 `items` |

当前可以保留额外字段，但必须补齐 v2 的四个标准字段。

### 3.5 v2 校验规则缺失

当前未实现：

- 请求内 `deal_ticket` 重复时返回 400；
- `last_deal_time` 必须等于本批次最大 `deal_time`；
- `deal_type` 只能是 `BUY/SELL`；
- `entry_type` 只能是 `IN/OUT/INOUT`；
- 标准错误码 `INVALID_LAST_DEAL_TIME`；
- 标准错误码 `BATCH_SIZE_EXCEEDED`。

### 3.6 幂等能力

已具备：

- 同一账号同一成交单号不会重复插入；
- SQLite 中存在唯一约束：`UNIQUE(account_login, ticket)`。

但正式迁移到 v2 时建议改成：

- 表内部使用 `account_id`；
- 唯一约束为 `UNIQUE(account_id, ticket)`；
- 保留原始 v2 payload；
- 同时保存字符串枚举和内部数字/枚举值。

---

## 4. 品种规格差距

v2 要求：

```text
POST /api/v1/ingest/symbols
```

字段：

- `symbol`
- `digits`
- `point`
- `contract_size`
- `tick_value`
- `tick_size`
- `currency_base`
- `currency_profit`

当前：

- 没有接口；
- 没有数据库表；
- EA 没有上传品种规格；
- 后续 R 倍数无法严谨计算。

响应要求：

```json
{
  "accepted": 1,
  "upserted": 1
}
```

---

## 5. 快照差距

v2 要求：

```text
POST /api/v1/ingest/snapshot
```

注意是单数 `snapshot`。

字段：

- `mt5_login`
- `timestamp`
- `balance`
- `equity`
- `margin`
- `free_margin`
- `margin_level`

当前：

- 没有接口；
- 没有 `snapshots` 表；
- EA 不上传余额、净值、保证金；
- 网页无法绘制真实净值曲线。

响应要求：

```json
{
  "accepted": true
}
```

---

## 6. 心跳差距

### 6.1 路径不一致

v2：

```text
POST /api/v1/sync/heartbeat
```

当前：

```text
POST /api/v1/ingest/heartbeat
```

### 6.2 请求不一致

v2：

```json
{
  "mt5_login": 88973405,
  "timestamp": 1753082193,
  "version": "v1.03"
}
```

当前：

```json
{
  "account_login": 88973405,
  "server_gmt_off": 10800,
  "account_currency": "USD",
  "broker_company": "...",
  "broker_server": "...",
  "ea_version": "0.1.0-probe"
}
```

### 6.3 响应不一致

v2：

```json
{
  "received": true
}
```

当前：

```json
{
  "account_login": 88973405,
  "status": "ok",
  "last_seen_at": "..."
}
```

### 6.4 频率不一致

- v2：12 次/小时/账户，即约 5 分钟一次。
- 当前 EA：每次 Timer 都发，默认 2 秒一次。

需要把 EA 心跳改为 300 秒一次，或加独立心跳计时器。

### 6.5 存储模型不一致

v2 设计是心跳历史表，每次插入一条。

当前 `heartbeats` 是每个账号只保留一行的 upsert 表。为了满足在线状态和历史诊断，建议使用 v2 的历史表，并可额外维护账号表上的 `last_heartbeat_at` 缓存字段。

---

## 7. 鉴权差距

### 7.1 Key 格式

v2 要求：

```text
sk_live_{32位随机字符串}
sk_test_{32位随机字符串}
```

当前生成：

```text
ts.<prefix>.<secret>
```

需要决定：

1. 严格改成 v2 的 `sk_live_...` / `sk_test_...`；或
2. 短期同时兼容两种格式。

建议短期兼容，网页新生成的 Key 改为 v2 格式。

### 7.2 HMAC

v2 支持：

- `Authorization: Bearer <secret_key>`；
- 或 `X-Timestamp` + `X-Signature`。

当前：

- 只实现 Bearer；
- 没有 HMAC；
- 没有时间戳防重放。

P0 可先只做 Bearer，但需要预留 HMAC。正式上线前应实现 HMAC 和 request id。

### 7.3 多 Key 轮换

v2 要求多个密钥可以并发有效，平滑迁移。

当前：

- 一个账号只有一个 `key_prefix/key_hash`；
- 重置后旧 Key 立即失效。

建议新增 `account_sync_keys` 表：

- `id`
- `account_id`
- `key_prefix`
- `key_hash`
- `environment`：live/test
- `revoked_at`
- `last_used_at`
- `created_at`

### 7.4 限流

v2 要求：

| 接口 | 限流 |
|---|---:|
| last sync time | 60 次/分钟/账户 |
| deals | 30 次/分钟/账户 |
| symbols | 10 次/分钟/账户 |
| snapshot | 120 次/小时/账户 |
| heartbeat | 12 次/小时/账户 |

当前没有接口限流。

---

## 8. 错误格式差距

v2 要求：

```json
{
  "error": {
    "code": "INVALID_MT5_LOGIN",
    "message": "MT5 login must be a positive integer",
    "details": {
      "field": "mt5_login",
      "value": -123
    }
  }
}
```

当前 FastAPI 默认返回：

```json
{
  "detail": [...]
}
```

需要增加统一异常处理，至少覆盖：

- `INVALID_MT5_LOGIN`
- `MISSING_SECRET_KEY`
- `INVALID_SECRET_KEY`
- `TIMESTAMP_EXPIRED`
- `SIGNATURE_MISMATCH`
- `ACCOUNT_NOT_FOUND`
- `RATE_LIMIT_EXCEEDED`
- `BATCH_SIZE_EXCEEDED`
- `INVALID_LAST_DEAL_TIME`
- `DUPLICATE_DEAL_TICKET_IN_REQUEST`
- `INTERNAL_ERROR`

---

## 9. 数据库差距

### 9.1 accounts

v2 需要：

- `mt5_login`
- `secret_key`
- `last_sync_time`
- `created_at`
- `updated_at`

当前有：

- 用户绑定字段；
- MT5 登录号；
- Key hash；
- 心跳时间；
- 券商信息。

缺少：

- `last_sync_time`；
- 多 Key 表；
- v2 格式 Key。

不建议按文档明文保存 `secret_key`。当前只保存 Hash 的方向更安全，应保留。

### 9.2 deals

当前是旧字段：

- `ticket`
- `entry` 数字
- `type` 数字
- `sl_price`
- `tp_price`
- `order_id`

v2 需要：

- `ticket`
- `order_ticket`
- `deal_type` 字符串
- `entry_type` 字符串
- `sl`
- `tp`

建议数据库内部采用稳定的 canonical 字段，同时保留 `raw_json`：

- `deal_type`：`BUY/SELL`
- `entry_type`：`IN/OUT/INOUT`
- 内部统计可再映射为枚举。

### 9.3 symbols / snapshots / heartbeats

当前：

- 无 `symbols` 表；
- 无 `snapshots` 表；
- 有旧版单行 `heartbeats` 表。

需要按 v2 新增三张表，或把心跳拆成历史表 + 账号缓存。

---

## 10. EA 差距

当前 `TradeSyncProbeEA`：

- 默认地址已经是局域网 HTTPS；
- 能补发历史成交；
- 能定时上传新成交；
- 能发旧版心跳；
- 成交上传幂等；
- 编译通过。

但不符合 v2 的地方：

1. 启动时没有调用 `/api/v1/sync/last_sync_time`。
2. 增量游标使用本地 `g_lastTicket`，不是服务器 `last_sync_time`。
3. 上传 JSON 是旧字段。
4. 不上传品种规格。
5. 不上传账户快照。
6. 心跳路径和请求体不符合 v2。
7. 心跳频率过高。
8. 没有 HMAC 签名。
9. 批次大小默认 50，虽不超限，但服务端应支持 1000。
10. 没有按 v2 响应中的 `last_sync_time_updated` 做确认。

---

## 11. 文档中需要确认的设计点

以下内容在 v2 文档内存在歧义，开发前建议确认。

### 11.1 账号是否允许自动创建

v2 成交接口示例写“账号不存在则自动创建”，但品种、快照、心跳又要求账号必须存在。

当前产品有网页注册和账号绑定流程。更合理的策略是：

- 用户必须先在网页绑定 MT5 账号；
- EA 只能向已绑定账号上传；
- 未绑定账号返回 404 或 403；
- 不允许 EA 拿任意 Key 自动创建账号。

### 11.2 `last_sync_time` 使用哪个时间口径

EA 用 `HistorySelect(last_sync_time + 1, now)`，因此这个值应与 MT5 `DEAL_TIME` 的口径一致。

建议：

- `last_sync_time`：保存 EA 使用的 MT5 服务器时间戳，用于增量游标；
- `deal_time`：保存原始 MT5 时间戳；
- `deal_time_utc`：根据 `server_gmt_off` 换算出的 UTC 时间；
- 统计按 UTC 和业务翻日点计算。

不能简单把增量游标改成 UTC，否则 EA 的 `HistorySelect` 可能漏单。

### 11.3 严格 `last_deal_time = max(deal_time)` 的影响

该规则适合正常增量上传，但会阻碍：

- 历史回填；
- 跨时间段补单；
- 修复旧成交；
- 多批次并发上传。

建议正常增量接口严格执行；后续单独增加 backfill/reconcile 接口。

### 11.4 `profit` 字段口径

文档写 `profit` 是“盈亏（含佣金+库存费）”，但同时又单独上传 `commission` 和 `swap`。

MT5 原始字段中通常：

```text
net_pnl = DEAL_PROFIT + DEAL_SWAP + DEAL_COMMISSION
```

建议明确：

- `profit` 保存 MT5 原始 `DEAL_PROFIT`；
- `swap` 保存 `DEAL_SWAP`；
- `commission` 保存 `DEAL_COMMISSION`；
- 净盈亏由服务端三项求和。

否则可能重复计算佣金和库存费。

### 11.5 余额类成交

v2 模型要求：

- `symbol` 必填；
- `price > 0`；
- `volume > 0`；
- `deal_type` 只能 BUY/SELL；
- `entry_type` 只能 IN/OUT/INOUT。

这无法表达入金、出金、赠金、余额修正等 MT5 balance deal。

如果 P0 只同步交易成交，可以明确排除余额类成交；否则需要扩展枚举和可选字段。

### 11.6 Secret Key 不建议明文存储

v2 数据库示例中 `secret_key VARCHAR(255)` 是明文。建议改为只存 Hash，并使用独立 Key 表支持多 Key 和轮换。

---

## 12. 建议改造顺序

### 第一步：服务端 v2 契约

1. 新增 v2 Pydantic 请求/响应模型。
2. 新增统一错误响应格式。
3. 给账号增加 `last_sync_time`。
4. 实现 `/api/v1/sync/last_sync_time`。
5. 改造 `/api/v1/ingest/deals` 支持 v2 JSON。
6. 响应返回 `accepted/inserted/duplicates/last_sync_time_updated`。
7. 加批次大小、重复 ticket、`last_deal_time` 校验。

### 第二步：补齐 v2 数据表和接口

1. 新增 `symbols` 表与 upsert 接口。
2. 新增 `snapshots` 表与单条快照接口。
3. 新增 v2 心跳历史表和 `/api/v1/sync/heartbeat`。
4. 账号表缓存最近心跳和最近同步时间。

### 第三步：鉴权与限流

1. 生成 `sk_live_...` / `sk_test_...` 格式 Key。
2. 短期兼容当前 `ts.<prefix>.<secret>`。
3. 新增多 Key 表，支持旧 Key 平滑轮换。
4. 加账号维度限流。
5. 再实现 HMAC。

### 第四步：EA 改造

1. 启动后先请求 `/sync/last_sync_time`。
2. 首次没有同步时间时按配置天数回填。
3. 后续按服务器时间增量查询。
4. 成交 JSON 改为 v2 字段。
5. 上传品种规格。
6. 每 30 秒上传快照。
7. 每 5 分钟上传心跳。
8. 根据 v2 响应更新本地状态。
9. 重新编译并做断网补发测试。

### 第五步：测试

必须覆盖：

- 首次同步返回 0；
- 增量上传后返回最后同步时间；
- 再次查询能拿到更新时间；
- 重复成交计入 `duplicates`；
- 批次超过 1000 返回标准错误；
- `last_deal_time` 错误返回标准错误；
- symbols upsert；
- snapshot 幂等；
- heartbeat 写入；
- 错误 Key 返回 401；
- Key 与账号不匹配返回 403。

---

## 13. 当前可保留的能力

以下能力虽然不属于 EA v2 同步契约的核心，但对产品仍有价值，应继续保留：

- 邮箱验证码注册/登录；
- 网页账号绑定；
- 连接控制台；
- 账号和用户的多租户关系；
- Key 只显示一次；
- 成交幂等；
- 原始 payload 留存；
- 简单订单配对；
- 网页展示成交和订单；
- 局域网 HTTPS 访问。

改造时应把这些能力迁移到 v2 数据模型上，而不是删除。