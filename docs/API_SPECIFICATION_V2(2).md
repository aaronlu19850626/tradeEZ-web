# TradeSync-Web API 规范文档 v2.1

**版本**：v2.1（UTC 开仓时间游标 / 两阶段提交）
**日期**：2026-09-17
**适用于**：`tradeEZ.mq5` 数据同步模块
**协议**：HTTPS
**格式**：JSON / UTF-8

---

## 1. 协议原则

1. 同步密钥只能由 Web 服务器生成，MT5 客户端不得生成、派生或拆分密钥。
2. 密钥与 MT5 账户及服务器保存的辅助信息绑定；EA 只负责在 `Inp_SecretKey` 中保存服务器下发的完整密钥。
3. 所有时间字段均为 Unix UTC 秒，不传递服务器本地时间。
4. `last_sync_time` 的唯一含义是：服务器已经确认接收的数据中，最大的订单开仓时间 `open_time`。
5. 成交上传和同步游标更新是两个独立步骤。上传接口不得隐式推进游标。
6. EA 使用包含式边界 `open_time >= last_sync_time`。边界数据允许重传，服务器必须按成交 ticket 幂等处理。
7. 只有全部批次上传成功后，EA 才能调用游标更新接口。
8. 任意批次或游标更新失败时，下一轮允许从原游标重新上传；重复数据不应产生副作用。

### 1.1 完整同步流程

```text
Web 账户页面
  └─ 服务器生成并显示一次账户同步密钥
          │
          ▼
EA 配置 Inp_SecretKey（完整、不透明字符串）
          │
          ▼
POST /api/v1/sync/last_sync_time
          │
          ├─ 返回有效游标：从该 UTC 开仓时间开始，包含边界采集
          └─ 返回 0 / 无法取得：从 UTC 当前时间向前回溯 7 日
          │
          ▼
按开仓时间筛选订单，成交的 open_time/deal_time 均转换为 UTC
          │
          ▼
POST /api/v1/ingest/deals（可分多批，单批最多 1000 条）
          │
          ├─ 任一批失败：结束，不更新游标
          └─ 所有批成功
          │
          ▼
POST /api/v1/sync/update_last_sync_time
  last_sync_time = 本轮最大 open_time
```

---

## 2. 通用规范

### 2.1 Base URL

```text
生产环境：https://api.tradeez.cn
本地开发：http://localhost:8000
```

### 2.2 请求头

EA 的每个请求都发送以下请求头：

```http
Content-Type: application/json
Authorization: Bearer {完整的服务器生成密钥}
X-Timestamp: {当前 Unix UTC 秒}
X-Signature: {HMAC-SHA256 十六进制小写字符串}
```

签名原文必须使用实际发送的原始 JSON body，不能重新格式化：

```python
message = raw_body_bytes + str(x_timestamp).encode("ascii")
signature = hmac.new(secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()
```

服务器应使用常量时间比较验证签名，并拒绝与服务器 UTC 时间相差超过 300 秒的请求。

### 2.3 密钥生成与管理

- 密钥由服务器结合账户号、辅助绑定信息、服务器端秘密和安全随机数生成；推荐格式：`sk_live_{random}` / `sk_test_{random}`。
- 密钥应至少包含 256 bit 随机熵，账户号和辅助信息不能作为唯一熵源。
- 明文仅在创建/轮换时向已登录用户显示一次。若服务端验证 HMAC，必须以加密方式保存可恢复的 HMAC 密钥；只有不可逆哈希无法计算预期 HMAC。
- 一个密钥只能访问其绑定的 `mt5_login`。Bearer 有效但账户不匹配时返回 `403`。
- 支持吊销、轮换、创建时间、最后使用时间和环境标识。
- Web 端的密钥创建/轮换路由属于账户管理 API，不由 EA 调用，本规范不限定其前端路由。

### 2.4 时间规则

| 字段 | 标准 | 说明 |
|---|---|---|
| `X-Timestamp` | Unix UTC 秒 | 请求签名及防重放 |
| `last_sync_time` | Unix UTC 秒 | 已确认数据中的最大订单开仓时间 |
| `open_time` | Unix UTC 秒 | 该 position/order 的首次建仓时间 |
| `deal_time` | Unix UTC 秒 | 当前成交发生时间 |
| `snapshot_time` | Unix UTC 秒 | 账户快照采集时间 |
| `server_gmt_off` | 固定为 `0` | v2.1 数据已规范化为 UTC，仅保留兼容字段 |

禁止服务器再次根据 `server_gmt_off` 转换 v2.1 时间字段。

### 2.5 成功与错误

- 任意 `2xx` 表示请求成功。
- `POST /ingest/deals` 返回 `2xx` 时，必须保证批次中每条记录均已插入或已判定为重复。
- 若批次含无效记录，应整批返回非 `2xx`，不得返回“部分拒绝但 HTTP 200”。

统一错误格式：

```json
{
  "error": {
    "code": "INVALID_SECRET_KEY",
    "message": "The provided secret key is invalid",
    "details": {}
  }
}
```

| HTTP | 典型错误码 | 说明 |
|---|---|---|
| 400 | `INVALID_REQUEST` | 字段、类型或批次不合法 |
| 401 | `INVALID_SECRET_KEY` / `SIGNATURE_MISMATCH` / `TIMESTAMP_EXPIRED` | 鉴权失败 |
| 403 | `ACCOUNT_KEY_MISMATCH` | 密钥不属于该 MT5 账户 |
| 409 | `CURSOR_AHEAD_OF_DATA` | 游标超过服务器已接收的最大开仓时间 |
| 429 | `RATE_LIMIT_EXCEEDED` | 请求过于频繁 |
| 500 | `INTERNAL_ERROR` | 服务器内部错误 |
| 503 | `SERVICE_UNAVAILABLE` | 服务不可用 |

---

## 3. API 端点

### 3.1 查询最后同步时间

`POST /api/v1/sync/last_sync_time`

请求：

```json
{
  "mt5_login": 88973405
}
```

成功响应：

```json
{
  "last_sync_time": 1789632000
}
```

首次同步：

```json
{
  "last_sync_time": 0
}
```

规则：

- `last_sync_time` 必须为 Unix UTC 秒。
- 账户已绑定但从未同步时返回 `0`。
- 密钥无效或账户不匹配时不得伪装成首次同步，必须返回 `401/403`。
- EA 收到 `0` 或查询失败时，从 `TimeGMT() - 7 * 86400` 开始采集。

### 3.2 上传成交批次

`POST /api/v1/ingest/deals`

请求：

```json
{
  "mt5_login": 88973405,
  "server_gmt_off": 0,
  "deals": [
    {
      "ticket": 1234567890,
      "position_id": 1122334455,
      "order_id": 9876543210,
      "symbol": "XAUUSD",
      "entry": 0,
      "type": 0,
      "volume": 0.10,
      "price": 2050.50000,
      "sl_price": 2040.00000,
      "tp_price": 2060.00000,
      "profit": 0.00,
      "swap": 0.00,
      "commission": -2.50,
      "magic": 920717,
      "comment": "TradeEZ-SC",
      "open_time": 1789632000,
      "deal_time": 1789632000
    },
    {
      "ticket": 1234567999,
      "position_id": 1122334455,
      "order_id": 9876543299,
      "symbol": "XAUUSD",
      "entry": 1,
      "type": 1,
      "volume": 0.10,
      "price": 2062.30000,
      "sl_price": 0.00000,
      "tp_price": 0.00000,
      "profit": 1180.00,
      "swap": -1.20,
      "commission": -2.50,
      "magic": 920717,
      "comment": "TradeEZ-SC",
      "open_time": 1789632000,
      "deal_time": 1789632400
    }
  ]
}
```

顶层字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `mt5_login` | int64 | 是 | MT5 登录账号 |
| `server_gmt_off` | integer | 是 | v2.1 固定为 `0` |
| `deals` | array | 是 | 1～1000 条；EA 默认单批 100 条 |

`deals[]` 字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `ticket` | uint64 | 是 | 成交 ticket，账户内幂等键 |
| `position_id` | int64 | 是 | MT5 position identifier |
| `order_id` | int64 | 是 | 关联订单 ticket |
| `symbol` | string | 是 | 品种 |
| `entry` | integer | 是 | MT5 枚举：`0=IN, 1=OUT, 2=INOUT, 3=OUT_BY` |
| `type` | integer | 是 | MT5 `ENUM_DEAL_TYPE` 原始值 |
| `volume` | number | 是 | 成交手数 |
| `price` | number | 是 | 成交价格 |
| `sl_price` | number | 是 | 止损价格，0 表示无 |
| `tp_price` | number | 是 | 止盈价格，0 表示无 |
| `profit` | number | 是 | MT5 原始成交利润 |
| `swap` | number | 是 | 库存费 |
| `commission` | number | 是 | 佣金 |
| `magic` | int64 | 是 | Magic Number |
| `comment` | string | 是 | UTF-8，JSON 转义后的成交备注 |
| `open_time` | int64 | 是 | 该 position 的首次开仓 Unix UTC 秒 |
| `deal_time` | int64 | 是 | 当前成交 Unix UTC 秒 |

成功响应：

```json
{
  "accepted": 2,
  "inserted": 2,
  "duplicates": 0
}
```

关键约束：

- 请求中不再包含 `last_deal_time`。
- 本接口不得更新 `accounts.last_sync_time`。
- 服务器唯一约束必须至少包含 `(account_id, ticket)`。
- 重复 ticket 视为成功，计入 `duplicates`，不能返回冲突错误。
- 一个 `2xx` 响应表示该批次的所有记录均已持久化或已存在。

### 3.3 更新最后同步时间

`POST /api/v1/sync/update_last_sync_time`

仅在本轮所有成交批次均成功后调用。

请求：

```json
{
  "mt5_login": 88973405,
  "last_sync_time": 1789632000
}
```

成功响应：

```json
{
  "last_sync_time": 1789632000,
  "updated": true
}
```

服务器处理规则：

1. 验证密钥属于 `mt5_login`。
2. 验证 `last_sync_time > 0` 且不晚于当前 UTC 时间的合理容差。
3. 验证账户已接收至少一条 `open_time == last_sync_time` 的成交；否则返回 `409 CURSOR_AHEAD_OF_DATA`。
4. 使用单调更新，游标不得倒退：

```sql
UPDATE accounts
SET last_sync_time = GREATEST(COALESCE(last_sync_time, 0), :candidate),
    updated_at = NOW()
WHERE id = :account_id
RETURNING last_sync_time;
```

5. 相同游标重复提交必须成功，并返回当前游标。

### 3.4 上传品种规格

`POST /api/v1/ingest/symbols`

```json
{
  "mt5_login": 88973405,
  "symbols": [
    {
      "name": "XAUUSD",
      "digits": 2,
      "point": 0.0100000000,
      "tick_value": 1.00000,
      "contract_size": 100.00
    }
  ]
}
```

成功响应：

```json
{"accepted": 1}
```

### 3.5 上传账户快照

`POST /api/v1/ingest/snapshots`

```json
{
  "mt5_login": 88973405,
  "snapshots": [
    {
      "balance": 10000.00,
      "equity": 10125.30,
      "margin": 300.00,
      "free_margin": 9825.30,
      "snapshot_time": 1789632400
    }
  ]
}
```

`snapshot_time` 为 Unix UTC 秒。建议以 `(account_id, snapshot_time)` 保证幂等。

### 3.6 心跳

`POST /api/v1/ingest/heartbeat`

```json
{
  "mt5_login": 88973405
}
```

成功响应：

```json
{
  "ok": true,
  "server_time": 1789632400
}
```

`server_time` 为服务器当前 Unix UTC 秒。

---

## 4. 边界与重试规则

### 4.1 同秒边界

不能使用 `last_sync_time + 1` 查询，因为多个订单可能在同一秒开仓。EA 必须使用：

```text
open_time >= last_sync_time
```

例如服务器游标为 `1789632000`，该秒有三个不同 ticket，则下一轮三个 ticket 都可再次上传。服务器按 ticket 去重后，再接受该秒内此前未出现的记录。

### 4.2 多批次失败

假设本轮共有三批：

- 批次 1、2 成功，批次 3 失败：不得调用游标更新接口。
- 下一轮从旧游标重新采集，批次 1、2 会作为重复记录成功处理。
- 三批全部成功后，才把本轮最大 `open_time` 提交为新游标。

### 4.3 游标更新失败

成交已经上传但游标请求失败时，不回滚成交数据；客户端保持同步失败状态。下一轮重复上传后再次提交游标。

### 4.4 无新数据

- 游标查询成功且没有新数据：本轮成功，不调用游标更新接口。
- 游标查询失败且近 7 日没有数据：本轮失败，不能显示为“已同步”。

### 4.5 幂等策略

```sql
INSERT INTO deals (...)
VALUES (...)
ON CONFLICT (account_id, ticket) DO NOTHING;
```

服务器不得用 `open_time`、`deal_time` 或数组下标作为成交唯一键。

---

## 5. 推荐数据模型

### 5.1 Pydantic 请求模型

```python
from pydantic import BaseModel, Field


class AccountRequest(BaseModel):
    mt5_login: int = Field(gt=0)


class DealItem(BaseModel):
    ticket: int = Field(gt=0)
    position_id: int = Field(gt=0)
    order_id: int = Field(ge=0)
    symbol: str = Field(min_length=1, max_length=64)
    entry: int
    type: int
    volume: float = Field(gt=0)
    price: float
    sl_price: float = 0
    tp_price: float = 0
    profit: float = 0
    swap: float = 0
    commission: float = 0
    magic: int = 0
    comment: str = ""
    open_time: int = Field(gt=0)
    deal_time: int = Field(gt=0)


class IngestDealsRequest(BaseModel):
    mt5_login: int = Field(gt=0)
    server_gmt_off: int = Field(default=0, ge=0, le=0)
    deals: list[DealItem] = Field(min_length=1, max_length=1000)


class UpdateLastSyncTimeRequest(BaseModel):
    mt5_login: int = Field(gt=0)
    last_sync_time: int = Field(gt=0)
```

### 5.2 数据库关键字段

```sql
CREATE TABLE accounts (
    id                 BIGSERIAL PRIMARY KEY,
    mt5_login          BIGINT NOT NULL UNIQUE,
    secret_key_hash    TEXT NOT NULL,
    key_revoked        BOOLEAN NOT NULL DEFAULT FALSE,
    last_sync_time     BIGINT NOT NULL DEFAULT 0,
    last_seen_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deals (
    id                 BIGSERIAL PRIMARY KEY,
    account_id         BIGINT NOT NULL REFERENCES accounts(id),
    ticket             NUMERIC(20,0) NOT NULL,
    position_id        BIGINT NOT NULL,
    order_id           BIGINT NOT NULL,
    symbol             TEXT NOT NULL,
    entry              SMALLINT NOT NULL,
    type               SMALLINT NOT NULL,
    volume             DOUBLE PRECISION NOT NULL,
    price              DOUBLE PRECISION NOT NULL,
    sl_price           DOUBLE PRECISION NOT NULL DEFAULT 0,
    tp_price           DOUBLE PRECISION NOT NULL DEFAULT 0,
    profit             DOUBLE PRECISION NOT NULL DEFAULT 0,
    swap               DOUBLE PRECISION NOT NULL DEFAULT 0,
    commission         DOUBLE PRECISION NOT NULL DEFAULT 0,
    magic              BIGINT NOT NULL DEFAULT 0,
    comment            TEXT NOT NULL DEFAULT '',
    open_time          TIMESTAMPTZ NOT NULL,
    deal_time          TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, ticket)
);

CREATE INDEX idx_deals_account_open_time
    ON deals(account_id, open_time);
CREATE INDEX idx_deals_account_position
    ON deals(account_id, position_id);
```

数据库写入时使用 UTC：

```python
from datetime import datetime, timezone

open_dt = datetime.fromtimestamp(item.open_time, tz=timezone.utc)
deal_dt = datetime.fromtimestamp(item.deal_time, tz=timezone.utc)
```

---

## 6. 服务端实现骨架

```python
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/api/v1")


@router.post("/sync/last_sync_time")
async def get_last_sync_time(req: AccountRequest, account=Depends(require_sync_account)):
    require_login_match(account, req.mt5_login)
    return {"last_sync_time": account.last_sync_time or 0}


@router.post("/ingest/deals")
async def ingest_deals(req: IngestDealsRequest, account=Depends(require_sync_account)):
    require_login_match(account, req.mt5_login)

    # 单个数据库事务；任何无效记录使整批失败。
    inserted = await insert_deals_idempotently(account.id, req.deals)
    return {
        "accepted": len(req.deals),
        "inserted": inserted,
        "duplicates": len(req.deals) - inserted,
    }


@router.post("/sync/update_last_sync_time")
async def update_last_sync_time(
    req: UpdateLastSyncTimeRequest,
    account=Depends(require_sync_account),
):
    require_login_match(account, req.mt5_login)

    exists = await deal_exists_at_open_time(account.id, req.last_sync_time)
    if not exists:
        raise HTTPException(
            status_code=409,
            detail={"code": "CURSOR_AHEAD_OF_DATA"},
        )

    account.last_sync_time = max(account.last_sync_time or 0, req.last_sync_time)
    await commit()
    return {"last_sync_time": account.last_sync_time, "updated": True}
```

重要：`ingest_deals()` 中不得修改 `account.last_sync_time`。

---

## 7. 接口测试清单

服务器实现必须覆盖以下测试：

1. 服务器创建密钥后，完整密钥可以访问绑定账户。
2. 密钥不属于请求账户时返回 `403`。
3. HMAC 使用完整密钥和 `raw_body + timestamp` 验证成功。
4. 过期时间戳、篡改 body、错误签名分别返回 `401`。
5. 首次查询游标返回 `0`。
6. 上传成功后再次查询，游标仍保持不变。
7. 单独调用更新接口后，查询返回新的开仓时间游标。
8. 重复上传同一 ticket 返回成功且计入 `duplicates`。
9. 两个订单开仓时间相同，重复边界查询不会漏掉其中任意一个。
10. 游标更新为服务器尚未接收的 `open_time` 时返回 `409`。
11. 提交小于当前值的游标不会倒退。
12. `open_time`、`deal_time`、`snapshot_time` 均按 UTC 保存和返回。
13. 任意无效成交使整个批次返回非 `2xx`。
14. 1001 条成交被拒绝，1000 条成交可以处理。

### 7.1 最小集成测试示例

```python
import requests

BASE_URL = "http://localhost:8000"
KEY = "sk_test_server_generated_value"
LOGIN = 88973405
HEADERS = {"Authorization": f"Bearer {KEY}"}  # 测试环境可按中间件补签名

cursor = requests.post(
    f"{BASE_URL}/api/v1/sync/last_sync_time",
    json={"mt5_login": LOGIN},
    headers=HEADERS,
).json()["last_sync_time"]

payload = {
    "mt5_login": LOGIN,
    "server_gmt_off": 0,
    "deals": [{
        "ticket": 1234567890,
        "position_id": 1122334455,
        "order_id": 9876543210,
        "symbol": "XAUUSD",
        "entry": 0,
        "type": 0,
        "volume": 0.10,
        "price": 2050.50,
        "sl_price": 2040.00,
        "tp_price": 2060.00,
        "profit": 0.00,
        "swap": 0.00,
        "commission": -2.50,
        "magic": 920717,
        "comment": "TradeEZ-SC",
        "open_time": 1789632000,
        "deal_time": 1789632000,
    }],
}

uploaded = requests.post(
    f"{BASE_URL}/api/v1/ingest/deals",
    json=payload,
    headers=HEADERS,
)
uploaded.raise_for_status()

# 上传接口不能隐式改变游标。
unchanged = requests.post(
    f"{BASE_URL}/api/v1/sync/last_sync_time",
    json={"mt5_login": LOGIN},
    headers=HEADERS,
).json()["last_sync_time"]
assert unchanged == cursor

updated = requests.post(
    f"{BASE_URL}/api/v1/sync/update_last_sync_time",
    json={"mt5_login": LOGIN, "last_sync_time": 1789632000},
    headers=HEADERS,
)
updated.raise_for_status()
assert updated.json()["last_sync_time"] == 1789632000
```

---

## 8. curl 示例

```bash
# 查询开仓时间游标
curl -X POST https://api.tradeez.cn/api/v1/sync/last_sync_time \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_server_generated_value" \
  -d '{"mt5_login":88973405}'

# 上传成交；不更新游标
curl -X POST https://api.tradeez.cn/api/v1/ingest/deals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_server_generated_value" \
  -d '{"mt5_login":88973405,"server_gmt_off":0,"deals":[{"ticket":1234567890,"position_id":1122334455,"order_id":9876543210,"symbol":"XAUUSD","entry":0,"type":0,"volume":0.10,"price":2050.50,"sl_price":2040.00,"tp_price":2060.00,"profit":0.00,"swap":0.00,"commission":-2.50,"magic":920717,"comment":"TradeEZ-SC","open_time":1789632000,"deal_time":1789632000}]}'

# 全部批次成功后推进游标
curl -X POST https://api.tradeez.cn/api/v1/sync/update_last_sync_time \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_server_generated_value" \
  -d '{"mt5_login":88973405,"last_sync_time":1789632000}'
```

生产请求还必须包含正确的 `X-Timestamp` 和 `X-Signature`。

---

**文档版本**：v2.1
**最后更新**：2026-09-17
**维护者**：TradeSync-Web 开发团队
