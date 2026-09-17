# TradeSync-Web API 规范文档 v2.0

**版本**：v2.0（增量同步）  
**日期**：2026-01-18  
**适用于**：Gold_SOP_EA 数据同步模块  
**协议**：HTTPS  
**格式**：JSON

---

## 目录

1. [概述](#概述)
2. [通用规范](#通用规范)
3. [鉴权机制](#鉴权机制)
4. [错误处理](#错误处理)
5. [API 端点](#api-端点)
6. [数据模型](#数据模型)
7. [数据库设计](#数据库设计)
8. [实现示例](#实现示例)
9. [测试用例](#测试用例)

---

## 概述

TradeSync-Web v2.0 采用**增量同步**架构，服务器端维护每个账户的最后同步时间（`last_sync_time`），客户端（EA）根据该时间点进行增量上传。

### 核心流程

```
┌─────────────────────────────────────────────────────────────┐
│                    EA (Gold_SOP_EA.mq5)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ 1. POST /api/v1/sync/last_sync_time
                       │    {mt5_login: 88973405}
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   TradeSync-Web 服务器                       │
│  查询: SELECT last_sync_time FROM accounts WHERE ...        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ 响应: {last_sync_time: 1753082193}
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    EA (Gold_SOP_EA.mq5)                      │
│  HistorySelect(1753082193 + 1, now)                         │
│  收集 3 笔新成交，最新时间 1753082400                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ 2. POST /api/v1/ingest/deals
                       │    {
                       │      mt5_login: 88973405,
                       │      last_deal_time: 1753082400,
                       │      deals: [...]
                       │    }
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   TradeSync-Web 服务器                       │
│  1. 幂等插入成交（ON CONFLICT DO NOTHING）                   │
│  2. 更新 accounts.last_sync_time = 1753082400               │
└─────────────────────────────────────────────────────────────┘
```

---

## 通用规范

### Base URL

```
生产环境：https://api.tradesync.example.com
测试环境：https://api-staging.tradesync.example.com
本地开发：http://localhost:8000
```

### Content-Type

```
Content-Type: application/json; charset=utf-8
```

### 字符编码

- **请求**：UTF-8
- **响应**：UTF-8

### 时间格式

- **Unix 时间戳**（秒）：`1753082193`
- **时区**：服务器端统一存储 UTC 时间
- **EA 传递**：`server_gmt_off` 字段标识 MT5 服务器时区偏移（秒）

### HTTP 方法

- `GET` - 查询数据（本项目暂无）
- `POST` - 提交数据（所有接口）

---

## 鉴权机制

### 方式一：Bearer Token（推荐）

**请求头**：
```http
Authorization: Bearer {secret_key}
```

**示例**：
```http
POST /api/v1/sync/last_sync_time HTTP/1.1
Host: api.tradesync.example.com
Content-Type: application/json
Authorization: Bearer sk_live_abc123def456ghi789

{"mt5_login": 88973405}
```

### 方式二：HMAC 签名（高安全性场景）

**请求头**：
```http
X-Timestamp: 1753082193
X-Signature: {hmac_sha256(secret_key, body + timestamp)}
```

**签名算法**（伪代码）：
```python
import hmac
import hashlib

def generate_signature(secret_key: str, body: str, timestamp: int) -> str:
    message = body + str(timestamp)
    signature = hmac.new(
        secret_key.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature
```

**验证逻辑**：
```python
# 1. 检查时间戳（防重放）
if abs(time.time() - request_timestamp) > 300:  # 5分钟窗口
    raise HTTPException(401, "Timestamp expired")

# 2. 验证签名
expected_sig = generate_signature(secret_key, request.body, request_timestamp)
if request.headers["X-Signature"] != expected_sig:
    raise HTTPException(401, "Invalid signature")
```

### 密钥管理

- **密钥格式**：`sk_live_{32位随机字符串}`（生产）/ `sk_test_{32位随机字符串}`（测试）
- **密钥长度**：至少 32 字节（256 bit）
- **密钥存储**：
  - 客户端：EA 输入参数 `Inp_SecretKey`
  - 服务器：数据库加密存储或环境变量
- **密钥轮换**：支持多个密钥并发有效（平滑迁移）

---

## 错误处理

### HTTP 状态码

| 状态码 | 含义 | 场景 |
|-------|------|------|
| 200 | 成功 | 请求处理成功 |
| 400 | 请求错误 | 参数缺失、格式错误 |
| 401 | 鉴权失败 | 密钥无效、签名错误 |
| 403 | 权限不足 | 该密钥无权访问指定账户 |
| 404 | 资源不存在 | 账户不存在（可选返回 200 + 空数据） |
| 429 | 请求过多 | 超过频率限制 |
| 500 | 服务器错误 | 内部错误 |
| 503 | 服务不可用 | 维护中 |

### 错误响应格式

```json
{
  "error": {
    "code": "INVALID_MT5_LOGIN",
    "message": "MT5 login must be a positive integer",
    "details": {
      "field": "mt5_login",
      "value": "invalid"
    }
  }
}
```

### 常见错误代码

| 错误码 | HTTP | 说明 | 解决方法 |
|-------|------|------|---------|
| `INVALID_MT5_LOGIN` | 400 | MT5 账号格式错误 | 检查账号是否为正整数 |
| `MISSING_SECRET_KEY` | 401 | 缺少鉴权信息 | 添加 Authorization 头 |
| `INVALID_SECRET_KEY` | 401 | 密钥无效 | 检查密钥是否正确 |
| `TIMESTAMP_EXPIRED` | 401 | 时间戳过期 | 同步系统时间 |
| `SIGNATURE_MISMATCH` | 401 | 签名错误 | 检查签名算法 |
| `ACCOUNT_NOT_FOUND` | 404 | 账户不存在 | 首次同步返回 `last_sync_time: 0` |
| `RATE_LIMIT_EXCEEDED` | 429 | 频率限制 | 降低请求频率 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 | 联系技术支持 |

---

## API 端点

### 1. 获取最后同步时间

#### 基本信息

- **端点**：`POST /api/v1/sync/last_sync_time`
- **用途**：查询指定 MT5 账户的最后同步时间
- **频率限制**：60 次/分钟/账户

#### 请求

**Headers**：
```http
Content-Type: application/json
Authorization: Bearer {secret_key}
```

**Body**：
```json
{
  "mt5_login": 88973405
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `mt5_login` | integer | ✅ | MT5 账号（登录号） |

**字段验证**：
```python
# mt5_login 验证
if not isinstance(mt5_login, int) or mt5_login <= 0:
    raise ValueError("mt5_login must be a positive integer")
```

#### 响应

**成功（200）**：
```json
{
  "last_sync_time": 1753082193
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|-----|------|------|
| `last_sync_time` | integer | Unix 时间戳（秒），0 表示从未同步 |

**首次同步（账户不存在）**：
```json
{
  "last_sync_time": 0
}
```

**错误响应**：

```json
// 401 - 鉴权失败
{
  "error": {
    "code": "INVALID_SECRET_KEY",
    "message": "The provided secret key is invalid"
  }
}

// 400 - 参数错误
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

#### 实现逻辑

```python
@router.post("/api/v1/sync/last_sync_time")
async def get_last_sync_time(
    request: LastSyncTimeRequest,
    db: Session = Depends(get_db),
    secret_key: str = Depends(verify_secret_key)
):
    # 1. 验证密钥权限
    account = db.query(Account).filter(
        Account.mt5_login == request.mt5_login,
        Account.secret_key == secret_key  # 或关联表
    ).first()
    
    # 2. 账户不存在返回 0（首次同步）
    if not account:
        return {"last_sync_time": 0}
    
    # 3. 返回最后同步时间
    return {
        "last_sync_time": account.last_sync_time or 0
    }
```

#### 边界情况

| 情况 | 处理 |
|-----|------|
| 账户不存在 | 返回 `{"last_sync_time": 0}` |
| `last_sync_time` 为 NULL | 返回 0 |
| 密钥无权访问该账户 | 返回 403 |

---

### 2. 上传成交记录

#### 基本信息

- **端点**：`POST /api/v1/ingest/deals`
- **用途**：批量上传 MT5 成交记录
- **频率限制**：30 次/分钟/账户
- **批次限制**：单次最多 1000 笔成交

#### 请求

**Headers**：
```http
Content-Type: application/json
Authorization: Bearer {secret_key}
```

**Body**：
```json
{
  "mt5_login": 88973405,
  "server_gmt_off": 10800,
  "last_deal_time": 1753082400,
  "deals": [
    {
      "deal_ticket": 1234567890,
      "order_ticket": 9876543210,
      "position_id": 1122334455,
      "symbol": "XAUUSD",
      "deal_type": "BUY",
      "entry_type": "IN",
      "deal_time": 1753082193,
      "price": 2050.50,
      "volume": 0.10,
      "commission": -2.50,
      "swap": 0.00,
      "profit": 125.80,
      "sl": 2040.00,
      "tp": 2060.00,
      "comment": "SOP_Entry_R1.5",
      "magic": 888888
    },
    {
      "deal_ticket": 1234567891,
      "order_ticket": 9876543210,
      "position_id": 1122334455,
      "symbol": "XAUUSD",
      "deal_type": "SELL",
      "entry_type": "OUT",
      "deal_time": 1753082400,
      "price": 2062.30,
      "volume": 0.10,
      "commission": -2.50,
      "swap": -1.20,
      "profit": 1180.00,
      "sl": 0.00,
      "tp": 0.00,
      "comment": "SOP_Exit_TP",
      "magic": 888888
    }
  ]
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `mt5_login` | integer | ✅ | MT5 账号 |
| `server_gmt_off` | integer | ✅ | MT5 服务器时区偏移（秒），如 GMT+3 = 10800 |
| `last_deal_time` | integer | ✅ | 本批次最新成交时间（Unix 时间戳） |
| `deals` | array | ✅ | 成交数组，至少 1 笔，最多 1000 笔 |

**deals[] 字段说明**：

| 字段 | 类型 | 必填 | 说明 | 示例 |
|-----|------|------|------|------|
| `deal_ticket` | integer | ✅ | 成交单号（唯一标识） | 1234567890 |
| `order_ticket` | integer | ✅ | 订单号 | 9876543210 |
| `position_id` | integer | ✅ | 持仓ID | 1122334455 |
| `symbol` | string | ✅ | 交易品种 | "XAUUSD" |
| `deal_type` | string | ✅ | 成交类型：`BUY` / `SELL` | "BUY" |
| `entry_type` | string | ✅ | 入场类型：`IN` / `OUT` / `INOUT` | "IN" |
| `deal_time` | integer | ✅ | 成交时间（Unix 时间戳） | 1753082193 |
| `price` | float | ✅ | 成交价格 | 2050.50 |
| `volume` | float | ✅ | 成交手数 | 0.10 |
| `commission` | float | ✅ | 佣金（负数） | -2.50 |
| `swap` | float | ✅ | 库存费 | -1.20 |
| `profit` | float | ✅ | 盈亏（含佣金+库存费） | 125.80 |
| `sl` | float | ❌ | 止损价（0 表示无） | 2040.00 |
| `tp` | float | ❌ | 止盈价（0 表示无） | 2060.00 |
| `comment` | string | ❌ | 订单备注 | "SOP_Entry_R1.5" |
| `magic` | integer | ❌ | 魔术编号 | 888888 |

**字段验证**：
```python
# 批次大小
if len(deals) == 0:
    raise ValueError("deals array cannot be empty")
if len(deals) > 1000:
    raise ValueError("deals array cannot exceed 1000 items")

# last_deal_time 必须是本批次最新时间
max_deal_time = max(deal.deal_time for deal in deals)
if last_deal_time != max_deal_time:
    raise ValueError("last_deal_time must equal the latest deal_time in the batch")

# deal_ticket 唯一性（同一请求内）
deal_tickets = [deal.deal_ticket for deal in deals]
if len(deal_tickets) != len(set(deal_tickets)):
    raise ValueError("Duplicate deal_ticket in request")
```

#### 响应

**成功（200）**：
```json
{
  "accepted": 2,
  "inserted": 2,
  "duplicates": 0,
  "last_sync_time_updated": 1753082400
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|-----|------|------|
| `accepted` | integer | 接收的成交数量 |
| `inserted` | integer | 实际插入的成交数量 |
| `duplicates` | integer | 重复的成交数量（已存在） |
| `last_sync_time_updated` | integer | 更新后的最后同步时间 |

**部分成功（200）**：
```json
{
  "accepted": 10,
  "inserted": 7,
  "duplicates": 3,
  "last_sync_time_updated": 1753082400
}
```

**错误响应**：

```json
// 400 - 批次过大
{
  "error": {
    "code": "BATCH_SIZE_EXCEEDED",
    "message": "deals array cannot exceed 1000 items",
    "details": {
      "max_size": 1000,
      "actual_size": 1500
    }
  }
}

// 400 - last_deal_time 不匹配
{
  "error": {
    "code": "INVALID_LAST_DEAL_TIME",
    "message": "last_deal_time must equal the latest deal_time in the batch",
    "details": {
      "provided": 1753082300,
      "expected": 1753082400
    }
  }
}

// 401 - 鉴权失败
{
  "error": {
    "code": "INVALID_SECRET_KEY",
    "message": "The provided secret key is invalid"
  }
}
```

#### 实现逻辑

```python
@router.post("/api/v1/ingest/deals")
async def ingest_deals(
    request: IngestDealsRequest,
    db: Session = Depends(get_db),
    secret_key: str = Depends(verify_secret_key)
):
    # 1. 验证批次大小
    if len(request.deals) > 1000:
        raise HTTPException(400, "Batch size exceeded")
    
    # 2. 验证 last_deal_time
    max_deal_time = max(d.deal_time for d in request.deals)
    if request.last_deal_time != max_deal_time:
        raise HTTPException(400, "Invalid last_deal_time")
    
    # 3. 获取或创建账户
    account = get_or_create_account(
        db, request.mt5_login, secret_key
    )
    
    # 4. 幂等插入成交
    inserted = 0
    duplicates = 0
    
    for deal in request.deals:
        result = db.execute(
            """
            INSERT INTO deals (
                account_id, ticket, order_ticket, position_id,
                symbol, deal_type, entry_type, deal_time,
                price, volume, commission, swap, profit,
                sl, tp, comment, magic
            ) VALUES (
                :account_id, :ticket, :order_ticket, :position_id,
                :symbol, :deal_type, :entry_type, :deal_time,
                :price, :volume, :commission, :swap, :profit,
                :sl, :tp, :comment, :magic
            )
            ON CONFLICT (account_id, ticket) DO NOTHING
            RETURNING id
            """,
            {
                "account_id": account.id,
                "ticket": deal.deal_ticket,
                "order_ticket": deal.order_ticket,
                "position_id": deal.position_id,
                "symbol": deal.symbol,
                "deal_type": deal.deal_type,
                "entry_type": deal.entry_type,
                "deal_time": deal.deal_time,
                "price": deal.price,
                "volume": deal.volume,
                "commission": deal.commission,
                "swap": deal.swap,
                "profit": deal.profit,
                "sl": deal.sl or 0,
                "tp": deal.tp or 0,
                "comment": deal.comment or "",
                "magic": deal.magic or 0
            }
        )
        
        if result.rowcount > 0:
            inserted += 1
        else:
            duplicates += 1
    
    # 5. 更新最后同步时间
    db.execute(
        """
        UPDATE accounts
        SET last_sync_time = :time,
            updated_at = NOW()
        WHERE id = :id
        """,
        {"time": request.last_deal_time, "id": account.id}
    )
    
    db.commit()
    
    # 6. 返回结果
    return {
        "accepted": len(request.deals),
        "inserted": inserted,
        "duplicates": duplicates,
        "last_sync_time_updated": request.last_deal_time
    }
```

#### 幂等性保证

- **唯一约束**：`UNIQUE(account_id, ticket)`
- **冲突处理**：`ON CONFLICT (account_id, ticket) DO NOTHING`
- **结果**：重复上传同一笔成交不会产生重复记录

---

### 3. 上传品种规格

#### 基本信息

- **端点**：`POST /api/v1/ingest/symbols`
- **用途**：上传 MT5 品种规格（用于计算 R 倍数）
- **频率限制**：10 次/分钟/账户

#### 请求

**Headers**：
```http
Content-Type: application/json
Authorization: Bearer {secret_key}
```

**Body**：
```json
{
  "mt5_login": 88973405,
  "symbols": [
    {
      "symbol": "XAUUSD",
      "digits": 2,
      "point": 0.01,
      "contract_size": 100.0,
      "tick_value": 1.0,
      "tick_size": 0.01,
      "currency_base": "XAU",
      "currency_profit": "USD"
    }
  ]
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `mt5_login` | integer | ✅ | MT5 账号 |
| `symbols` | array | ✅ | 品种数组 |

**symbols[] 字段说明**：

| 字段 | 类型 | 必填 | 说明 | 示例 |
|-----|------|------|------|------|
| `symbol` | string | ✅ | 品种名称 | "XAUUSD" |
| `digits` | integer | ✅ | 小数位数 | 2 |
| `point` | float | ✅ | 最小变动单位 | 0.01 |
| `contract_size` | float | ✅ | 合约大小 | 100.0 |
| `tick_value` | float | ✅ | 跳动价值 | 1.0 |
| `tick_size` | float | ✅ | 跳动大小 | 0.01 |
| `currency_base` | string | ✅ | 基础货币 | "XAU" |
| `currency_profit` | string | ✅ | 盈利货币 | "USD" |

#### 响应

**成功（200）**：
```json
{
  "accepted": 1,
  "upserted": 1
}
```

---

### 4. 上传账户快照

#### 基本信息

- **端点**：`POST /api/v1/ingest/snapshot`
- **用途**：上传账户余额、净值、保证金快照（绘制净值曲线）
- **频率限制**：120 次/小时/账户（每 30 秒一次）

#### 请求

**Headers**：
```http
Content-Type: application/json
Authorization: Bearer {secret_key}
```

**Body**：
```json
{
  "mt5_login": 88973405,
  "timestamp": 1753082193,
  "balance": 10000.00,
  "equity": 10125.80,
  "margin": 205.00,
  "free_margin": 9920.80,
  "margin_level": 4939.41
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `mt5_login` | integer | ✅ | MT5 账号 |
| `timestamp` | integer | ✅ | 快照时间（Unix 时间戳） |
| `balance` | float | ✅ | 余额 |
| `equity` | float | ✅ | 净值 |
| `margin` | float | ✅ | 已用保证金 |
| `free_margin` | float | ✅ | 可用保证金 |
| `margin_level` | float | ✅ | 保证金比例（%） |

#### 响应

**成功（200）**：
```json
{
  "accepted": true
}
```

---

### 5. 心跳

#### 基本信息

- **端点**：`POST /api/v1/sync/heartbeat`
- **用途**：EA 在线状态检测
- **频率限制**：12 次/小时/账户（每 5 分钟一次）

#### 请求

**Headers**：
```http
Content-Type: application/json
Authorization: Bearer {secret_key}
```

**Body**：
```json
{
  "mt5_login": 88973405,
  "timestamp": 1753082193,
  "version": "v1.03"
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `mt5_login` | integer | ✅ | MT5 账号 |
| `timestamp` | integer | ✅ | 心跳时间 |
| `version` | string | ❌ | EA 版本号 |

#### 响应

**成功（200）**：
```json
{
  "received": true
}
```

---

## 数据模型

### Pydantic 模型（FastAPI）

```python
from pydantic import BaseModel, Field
from typing import List, Optional

# ============ 请求模型 ============

class LastSyncTimeRequest(BaseModel):
    mt5_login: int = Field(..., gt=0, description="MT5 账号")

class Deal(BaseModel):
    deal_ticket: int = Field(..., description="成交单号")
    order_ticket: int = Field(..., description="订单号")
    position_id: int = Field(..., description="持仓ID")
    symbol: str = Field(..., min_length=1, max_length=50, description="品种")
    deal_type: str = Field(..., regex="^(BUY|SELL)$", description="成交类型")
    entry_type: str = Field(..., regex="^(IN|OUT|INOUT)$", description="入场类型")
    deal_time: int = Field(..., gt=0, description="成交时间")
    price: float = Field(..., gt=0, description="价格")
    volume: float = Field(..., gt=0, description="手数")
    commission: float = Field(..., description="佣金")
    swap: float = Field(..., description="库存费")
    profit: float = Field(..., description="盈亏")
    sl: Optional[float] = Field(0, description="止损")
    tp: Optional[float] = Field(0, description="止盈")
    comment: Optional[str] = Field("", max_length=500, description="备注")
    magic: Optional[int] = Field(0, description="魔术编号")

class IngestDealsRequest(BaseModel):
    mt5_login: int = Field(..., gt=0)
    server_gmt_off: int = Field(..., description="GMT 偏移（秒）")
    last_deal_time: int = Field(..., gt=0, description="最新成交时间")
    deals: List[Deal] = Field(..., min_items=1, max_items=1000)

    class Config:
        # 验证 last_deal_time 是否等于最大 deal_time
        @validator('last_deal_time')
        def validate_last_deal_time(cls, v, values):
            if 'deals' in values:
                max_time = max(d.deal_time for d in values['deals'])
                if v != max_time:
                    raise ValueError('last_deal_time must equal max deal_time')
            return v

class Symbol(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=50)
    digits: int = Field(..., ge=0, le=8)
    point: float = Field(..., gt=0)
    contract_size: float = Field(..., gt=0)
    tick_value: float = Field(..., gt=0)
    tick_size: float = Field(..., gt=0)
    currency_base: str = Field(..., max_length=10)
    currency_profit: str = Field(..., max_length=10)

class IngestSymbolsRequest(BaseModel):
    mt5_login: int = Field(..., gt=0)
    symbols: List[Symbol] = Field(..., min_items=1)

class SnapshotRequest(BaseModel):
    mt5_login: int = Field(..., gt=0)
    timestamp: int = Field(..., gt=0)
    balance: float = Field(...)
    equity: float = Field(...)
    margin: float = Field(..., ge=0)
    free_margin: float = Field(...)
    margin_level: float = Field(..., ge=0)

class HeartbeatRequest(BaseModel):
    mt5_login: int = Field(..., gt=0)
    timestamp: int = Field(..., gt=0)
    version: Optional[str] = Field(None, max_length=20)

# ============ 响应模型 ============

class LastSyncTimeResponse(BaseModel):
    last_sync_time: int = Field(..., ge=0)

class IngestDealsResponse(BaseModel):
    accepted: int
    inserted: int
    duplicates: int
    last_sync_time_updated: int

class IngestSymbolsResponse(BaseModel):
    accepted: int
    upserted: int

class SnapshotResponse(BaseModel):
    accepted: bool

class HeartbeatResponse(BaseModel):
    received: bool

class ErrorDetail(BaseModel):
    field: Optional[str] = None
    value: Optional[str] = None
    message: Optional[str] = None

class ErrorResponse(BaseModel):
    error: dict = Field(..., description="错误信息")
    # {
    #   "code": "ERROR_CODE",
    #   "message": "Human readable message",
    #   "details": {...}
    # }
```

---

## 数据库设计

### 表结构

#### 1. accounts（账户表）

```sql
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    mt5_login BIGINT NOT NULL UNIQUE,
    secret_key VARCHAR(255) NOT NULL,
    last_sync_time BIGINT DEFAULT 0,  -- ← v2.0 新增
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_accounts_mt5_login ON accounts(mt5_login);
CREATE INDEX idx_accounts_last_sync_time ON accounts(last_sync_time);
```

#### 2. deals（成交表）

```sql
CREATE TABLE deals (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    ticket BIGINT NOT NULL,  -- deal_ticket
    order_ticket BIGINT NOT NULL,
    position_id BIGINT NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    deal_type VARCHAR(10) NOT NULL,  -- BUY / SELL
    entry_type VARCHAR(10) NOT NULL,  -- IN / OUT / INOUT
    deal_time BIGINT NOT NULL,  -- Unix timestamp
    price DECIMAL(20, 8) NOT NULL,
    volume DECIMAL(20, 8) NOT NULL,
    commission DECIMAL(20, 8) NOT NULL,
    swap DECIMAL(20, 8) NOT NULL,
    profit DECIMAL(20, 8) NOT NULL,
    sl DECIMAL(20, 8) DEFAULT 0,
    tp DECIMAL(20, 8) DEFAULT 0,
    comment TEXT,
    magic INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- 唯一约束：账户 + 成交单号
    CONSTRAINT uk_deals_account_ticket UNIQUE (account_id, ticket)
);

-- 索引
CREATE INDEX idx_deals_account_id ON deals(account_id);
CREATE INDEX idx_deals_deal_time ON deals(deal_time);
CREATE INDEX idx_deals_symbol ON deals(symbol);
CREATE INDEX idx_deals_position_id ON deals(position_id);
```

#### 3. symbols（品种表）

```sql
CREATE TABLE symbols (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    digits INTEGER NOT NULL,
    point DECIMAL(20, 8) NOT NULL,
    contract_size DECIMAL(20, 8) NOT NULL,
    tick_value DECIMAL(20, 8) NOT NULL,
    tick_size DECIMAL(20, 8) NOT NULL,
    currency_base VARCHAR(10) NOT NULL,
    currency_profit VARCHAR(10) NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT uk_symbols_account_symbol UNIQUE (account_id, symbol)
);

CREATE INDEX idx_symbols_account_id ON symbols(account_id);
```

#### 4. snapshots（快照表）

```sql
CREATE TABLE snapshots (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    timestamp BIGINT NOT NULL,
    balance DECIMAL(20, 8) NOT NULL,
    equity DECIMAL(20, 8) NOT NULL,
    margin DECIMAL(20, 8) NOT NULL,
    free_margin DECIMAL(20, 8) NOT NULL,
    margin_level DECIMAL(20, 4) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT uk_snapshots_account_timestamp UNIQUE (account_id, timestamp)
);

CREATE INDEX idx_snapshots_account_id ON snapshots(account_id);
CREATE INDEX idx_snapshots_timestamp ON snapshots(timestamp);
```

#### 5. heartbeats（心跳表）

```sql
CREATE TABLE heartbeats (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    timestamp BIGINT NOT NULL,
    version VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_heartbeats_account_id ON heartbeats(account_id);
CREATE INDEX idx_heartbeats_timestamp ON heartbeats(timestamp);
```

### 数据库迁移脚本

#### Alembic 迁移（v2.0）

```python
"""Add last_sync_time to accounts

Revision ID: 0002_add_last_sync_time
Revises: 0001_initial
Create Date: 2026-01-18

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0002_add_last_sync_time'
down_revision = '0001_initial'
branch_labels = None
depends_on = None

def upgrade():
    # 添加字段
    op.add_column('accounts', 
        sa.Column('last_sync_time', sa.BigInteger(), nullable=False, server_default='0')
    )
    
    # 添加索引
    op.create_index('idx_accounts_last_sync_time', 'accounts', ['last_sync_time'])

def downgrade():
    op.drop_index('idx_accounts_last_sync_time', table_name='accounts')
    op.drop_column('accounts', 'last_sync_time')
```

---

## 实现示例

### FastAPI 完整实现

```python
# app/api/v1/sync.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Account, Deal, Symbol, Snapshot, Heartbeat
from app.schemas import (
    LastSyncTimeRequest, LastSyncTimeResponse,
    IngestDealsRequest, IngestDealsResponse,
    IngestSymbolsRequest, IngestSymbolsResponse,
    SnapshotRequest, SnapshotResponse,
    HeartbeatRequest, HeartbeatResponse
)
from app.auth import verify_secret_key
import time

router = APIRouter(prefix="/api/v1", tags=["sync"])

# ============ 1. 获取最后同步时间 ============

@router.post("/sync/last_sync_time", response_model=LastSyncTimeResponse)
async def get_last_sync_time(
    request: LastSyncTimeRequest,
    db: Session = Depends(get_db),
    secret_key: str = Depends(verify_secret_key)
):
    """
    获取指定 MT5 账户的最后同步时间
    
    - 账户不存在返回 0（首次同步）
    - last_sync_time 为 NULL 返回 0
    """
    account = db.query(Account).filter(
        Account.mt5_login == request.mt5_login,
        Account.secret_key == secret_key
    ).first()
    
    if not account:
        return {"last_sync_time": 0}
    
    return {
        "last_sync_time": account.last_sync_time or 0
    }

# ============ 2. 上传成交记录 ============

@router.post("/ingest/deals", response_model=IngestDealsResponse)
async def ingest_deals(
    request: IngestDealsRequest,
    db: Session = Depends(get_db),
    secret_key: str = Depends(verify_secret_key)
):
    """
    批量上传成交记录（幂等）
    
    - 自动创建账户（如不存在）
    - 幂等插入成交（ON CONFLICT DO NOTHING）
    - 更新 last_sync_time
    """
    # 1. 验证批次大小
    if len(request.deals) > 1000:
        raise HTTPException(400, detail={
            "code": "BATCH_SIZE_EXCEEDED",
            "message": "deals array cannot exceed 1000 items"
        })
    
    # 2. 验证 last_deal_time
    max_deal_time = max(d.deal_time for d in request.deals)
    if request.last_deal_time != max_deal_time:
        raise HTTPException(400, detail={
            "code": "INVALID_LAST_DEAL_TIME",
            "message": "last_deal_time must equal the latest deal_time"
        })
    
    # 3. 获取或创建账户
    account = db.query(Account).filter(
        Account.mt5_login == request.mt5_login
    ).first()
    
    if not account:
        account = Account(
            mt5_login=request.mt5_login,
            secret_key=secret_key,
            last_sync_time=0
        )
        db.add(account)
        db.flush()
    
    # 4. 幂等插入成交
    inserted = 0
    duplicates = 0
    
    for deal in request.deals:
        # 检查是否已存在
        existing = db.query(Deal).filter(
            Deal.account_id == account.id,
            Deal.ticket == deal.deal_ticket
        ).first()
        
        if existing:
            duplicates += 1
            continue
        
        # 插入新成交
        db_deal = Deal(
            account_id=account.id,
            ticket=deal.deal_ticket,
            order_ticket=deal.order_ticket,
            position_id=deal.position_id,
            symbol=deal.symbol,
            deal_type=deal.deal_type,
            entry_type=deal.entry_type,
            deal_time=deal.deal_time,
            price=deal.price,
            volume=deal.volume,
            commission=deal.commission,
            swap=deal.swap,
            profit=deal.profit,
            sl=deal.sl or 0,
            tp=deal.tp or 0,
            comment=deal.comment or "",
            magic=deal.magic or 0
        )
        db.add(db_deal)
        inserted += 1
    
    # 5. 更新最后同步时间
    account.last_sync_time = request.last_deal_time
    account.updated_at = db.func.now()
    
    # 6. 提交事务
    db.commit()
    
    return {
        "accepted": len(request.deals),
        "inserted": inserted,
        "duplicates": duplicates,
        "last_sync_time_updated": request.last_deal_time
    }

# ============ 3. 上传品种规格 ============

@router.post("/ingest/symbols", response_model=IngestSymbolsResponse)
async def ingest_symbols(
    request: IngestSymbolsRequest,
    db: Session = Depends(get_db),
    secret_key: str = Depends(verify_secret_key)
):
    """
    上传品种规格（用于计算 R 倍数）
    """
    account = db.query(Account).filter(
        Account.mt5_login == request.mt5_login
    ).first()
    
    if not account:
        raise HTTPException(404, detail="Account not found")
    
    upserted = 0
    
    for sym in request.symbols:
        # Upsert
        existing = db.query(Symbol).filter(
            Symbol.account_id == account.id,
            Symbol.symbol == sym.symbol
        ).first()
        
        if existing:
            # 更新
            existing.digits = sym.digits
            existing.point = sym.point
            existing.contract_size = sym.contract_size
            existing.tick_value = sym.tick_value
            existing.tick_size = sym.tick_size
            existing.currency_base = sym.currency_base
            existing.currency_profit = sym.currency_profit
            existing.updated_at = db.func.now()
        else:
            # 插入
            db_symbol = Symbol(
                account_id=account.id,
                symbol=sym.symbol,
                digits=sym.digits,
                point=sym.point,
                contract_size=sym.contract_size,
                tick_value=sym.tick_value,
                tick_size=sym.tick_size,
                currency_base=sym.currency_base,
                currency_profit=sym.currency_profit
            )
            db.add(db_symbol)
        
        upserted += 1
    
    db.commit()
    
    return {
        "accepted": len(request.symbols),
        "upserted": upserted
    }

# ============ 4. 上传账户快照 ============

@router.post("/ingest/snapshot", response_model=SnapshotResponse)
async def ingest_snapshot(
    request: SnapshotRequest,
    db: Session = Depends(get_db),
    secret_key: str = Depends(verify_secret_key)
):
    """
    上传账户快照（绘制净值曲线）
    """
    account = db.query(Account).filter(
        Account.mt5_login == request.mt5_login
    ).first()
    
    if not account:
        raise HTTPException(404, detail="Account not found")
    
    # 检查是否已存在
    existing = db.query(Snapshot).filter(
        Snapshot.account_id == account.id,
        Snapshot.timestamp == request.timestamp
    ).first()
    
    if not existing:
        snapshot = Snapshot(
            account_id=account.id,
            timestamp=request.timestamp,
            balance=request.balance,
            equity=request.equity,
            margin=request.margin,
            free_margin=request.free_margin,
            margin_level=request.margin_level
        )
        db.add(snapshot)
        db.commit()
    
    return {"accepted": True}

# ============ 5. 心跳 ============

@router.post("/sync/heartbeat", response_model=HeartbeatResponse)
async def heartbeat(
    request: HeartbeatRequest,
    db: Session = Depends(get_db),
    secret_key: str = Depends(verify_secret_key)
):
    """
    EA 在线状态检测
    """
    account = db.query(Account).filter(
        Account.mt5_login == request.mt5_login
    ).first()
    
    if not account:
        raise HTTPException(404, detail="Account not found")
    
    heartbeat = Heartbeat(
        account_id=account.id,
        timestamp=request.timestamp,
        version=request.version
    )
    db.add(heartbeat)
    db.commit()
    
    return {"received": True}
```

### 鉴权中间件

```python
# app/auth.py

from fastapi import Header, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Account

async def verify_secret_key(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> str:
    """
    验证 Bearer Token
    
    Authorization: Bearer sk_live_abc123
    """
    if not authorization:
        raise HTTPException(401, detail={
            "code": "MISSING_SECRET_KEY",
            "message": "Authorization header is required"
        })
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, detail={
            "code": "INVALID_AUTH_FORMAT",
            "message": "Authorization must be 'Bearer <token>'"
        })
    
    secret_key = authorization[7:]  # 去掉 "Bearer "
    
    # 验证密钥是否存在
    account = db.query(Account).filter(
        Account.secret_key == secret_key
    ).first()
    
    if not account:
        raise HTTPException(401, detail={
            "code": "INVALID_SECRET_KEY",
            "message": "The provided secret key is invalid"
        })
    
    return secret_key
```

---

## 测试用例

### 单元测试（pytest）

```python
# tests/test_sync_api.py

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db, Base, engine
from sqlalchemy.orm import Session

client = TestClient(app)

# 测试密钥
TEST_SECRET_KEY = "sk_test_abc123def456"
TEST_MT5_LOGIN = 88973405

@pytest.fixture
def db_session():
    # 创建测试数据库
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)

def test_get_last_sync_time_first_time():
    """测试：首次同步返回 0"""
    response = client.post(
        "/api/v1/sync/last_sync_time",
        json={"mt5_login": TEST_MT5_LOGIN},
        headers={"Authorization": f"Bearer {TEST_SECRET_KEY}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["last_sync_time"] == 0

def test_ingest_deals_success():
    """测试：成功上传成交"""
    response = client.post(
        "/api/v1/ingest/deals",
        json={
            "mt5_login": TEST_MT5_LOGIN,
            "server_gmt_off": 10800,
            "last_deal_time": 1753082400,
            "deals": [
                {
                    "deal_ticket": 1234567890,
                    "order_ticket": 9876543210,
                    "position_id": 1122334455,
                    "symbol": "XAUUSD",
                    "deal_type": "BUY",
                    "entry_type": "IN",
                    "deal_time": 1753082400,
                    "price": 2050.50,
                    "volume": 0.10,
                    "commission": -2.50,
                    "swap": 0.00,
                    "profit": 125.80,
                    "sl": 2040.00,
                    "tp": 2060.00,
                    "comment": "Test",
                    "magic": 888888
                }
            ]
        },
        headers={"Authorization": f"Bearer {TEST_SECRET_KEY}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["accepted"] == 1
    assert data["inserted"] == 1
    assert data["duplicates"] == 0
    assert data["last_sync_time_updated"] == 1753082400

def test_ingest_deals_duplicate():
    """测试：重复上传成交，返回 duplicates"""
    # 第一次上传
    client.post("/api/v1/ingest/deals", json={...})
    
    # 第二次上传（相同 deal_ticket）
    response = client.post("/api/v1/ingest/deals", json={...})
    
    assert response.status_code == 200
    data = response.json()
    assert data["inserted"] == 0
    assert data["duplicates"] == 1

def test_ingest_deals_invalid_last_deal_time():
    """测试：last_deal_time 不匹配，返回 400"""
    response = client.post(
        "/api/v1/ingest/deals",
        json={
            "mt5_login": TEST_MT5_LOGIN,
            "server_gmt_off": 10800,
            "last_deal_time": 1753082300,  # 错误
            "deals": [
                {
                    "deal_ticket": 1234567890,
                    "deal_time": 1753082400,  # 最新时间
                    # ...其他字段
                }
            ]
        },
        headers={"Authorization": f"Bearer {TEST_SECRET_KEY}"}
    )
    
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "INVALID_LAST_DEAL_TIME"

def test_unauthorized():
    """测试：无鉴权信息，返回 401"""
    response = client.post(
        "/api/v1/sync/last_sync_time",
        json={"mt5_login": TEST_MT5_LOGIN}
    )
    
    assert response.status_code == 401
```

### 集成测试脚本

```python
# scripts/test_sync_flow.py

import requests
import time

BASE_URL = "http://localhost:8000"
SECRET_KEY = "sk_test_abc123def456"
MT5_LOGIN = 88973405

def test_full_sync_flow():
    """测试完整同步流程"""
    
    print("=" * 60)
    print("测试：增量同步完整流程")
    print("=" * 60)
    
    # 1. 首次获取同步时间（应返回 0）
    print("\n1. 获取最后同步时间（首次）...")
    response = requests.post(
        f"{BASE_URL}/api/v1/sync/last_sync_time",
        json={"mt5_login": MT5_LOGIN},
        headers={"Authorization": f"Bearer {SECRET_KEY}"}
    )
    print(f"   响应: {response.json()}")
    assert response.json()["last_sync_time"] == 0
    
    # 2. 上传第一批成交
    print("\n2. 上传第一批成交（3笔）...")
    current_time = int(time.time())
    response = requests.post(
        f"{BASE_URL}/api/v1/ingest/deals",
        json={
            "mt5_login": MT5_LOGIN,
            "server_gmt_off": 10800,
            "last_deal_time": current_time,
            "deals": [
                {
                    "deal_ticket": 1000001,
                    "order_ticket": 2000001,
                    "position_id": 3000001,
                    "symbol": "XAUUSD",
                    "deal_type": "BUY",
                    "entry_type": "IN",
                    "deal_time": current_time - 20,
                    "price": 2050.00,
                    "volume": 0.10,
                    "commission": -2.50,
                    "swap": 0.00,
                    "profit": 0.00,
                    "magic": 888888
                },
                {
                    "deal_ticket": 1000002,
                    "order_ticket": 2000002,
                    "position_id": 3000002,
                    "symbol": "XAUUSD",
                    "deal_type": "BUY",
                    "entry_type": "IN",
                    "deal_time": current_time - 10,
                    "price": 2051.00,
                    "volume": 0.10,
                    "commission": -2.50,
                    "swap": 0.00,
                    "profit": 0.00,
                    "magic": 888888
                },
                {
                    "deal_ticket": 1000003,
                    "order_ticket": 2000001,
                    "position_id": 3000001,
                    "symbol": "XAUUSD",
                    "deal_type": "SELL",
                    "entry_type": "OUT",
                    "deal_time": current_time,  # 最新
                    "price": 2060.00,
                    "volume": 0.10,
                    "commission": -2.50,
                    "swap": -1.20,
                    "profit": 1000.00,
                    "magic": 888888
                }
            ]
        },
        headers={"Authorization": f"Bearer {SECRET_KEY}"}
    )
    result = response.json()
    print(f"   响应: {result}")
    assert result["inserted"] == 3
    assert result["last_sync_time_updated"] == current_time
    
    # 3. 再次获取同步时间（应返回 current_time）
    print("\n3. 获取最后同步时间（应更新）...")
    response = requests.post(
        f"{BASE_URL}/api/v1/sync/last_sync_time",
        json={"mt5_login": MT5_LOGIN},
        headers={"Authorization": f"Bearer {SECRET_KEY}"}
    )
    result = response.json()
    print(f"   响应: {result}")
    assert result["last_sync_time"] == current_time
    
    # 4. 上传第二批成交（增量）
    print("\n4. 上传第二批成交（增量，2笔）...")
    new_time = int(time.time())
    response = requests.post(
        f"{BASE_URL}/api/v1/ingest/deals",
        json={
            "mt5_login": MT5_LOGIN,
            "server_gmt_off": 10800,
            "last_deal_time": new_time,
            "deals": [
                {
                    "deal_ticket": 1000004,
                    "order_ticket": 2000003,
                    "position_id": 3000003,
                    "symbol": "XAUUSD",
                    "deal_type": "BUY",
                    "entry_type": "IN",
                    "deal_time": new_time - 5,
                    "price": 2055.00,
                    "volume": 0.10,
                    "commission": -2.50,
                    "swap": 0.00,
                    "profit": 0.00,
                    "magic": 888888
                },
                {
                    "deal_ticket": 1000005,
                    "order_ticket": 2000003,
                    "position_id": 3000003,
                    "symbol": "XAUUSD",
                    "deal_type": "SELL",
                    "entry_type": "OUT",
                    "deal_time": new_time,  # 最新
                    "price": 2065.00,
                    "volume": 0.10,
                    "commission": -2.50,
                    "swap": 0.00,
                    "profit": 1000.00,
                    "magic": 888888
                }
            ]
        },
        headers={"Authorization": f"Bearer {SECRET_KEY}"}
    )
    result = response.json()
    print(f"   响应: {result}")
    assert result["inserted"] == 2
    assert result["last_sync_time_updated"] == new_time
    
    # 5. 最终验证
    print("\n5. 最终验证同步时间...")
    response = requests.post(
        f"{BASE_URL}/api/v1/sync/last_sync_time",
        json={"mt5_login": MT5_LOGIN},
        headers={"Authorization": f"Bearer {SECRET_KEY}"}
    )
    result = response.json()
    print(f"   响应: {result}")
    assert result["last_sync_time"] == new_time
    
    print("\n" + "=" * 60)
    print("✅ 所有测试通过！")
    print("=" * 60)

if __name__ == "__main__":
    test_full_sync_flow()
```

---

## 附录

### A. Postman 测试集合

```json
{
  "info": {
    "name": "TradeSync-Web API v2.0",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Get Last Sync Time",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{secret_key}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"mt5_login\": {{mt5_login}}\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": {
          "raw": "{{base_url}}/api/v1/sync/last_sync_time",
          "host": ["{{base_url}}"],
          "path": ["api", "v1", "sync", "last_sync_time"]
        }
      }
    },
    {
      "name": "2. Ingest Deals",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{secret_key}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"mt5_login\": {{mt5_login}},\n  \"server_gmt_off\": 10800,\n  \"last_deal_time\": 1753082400,\n  \"deals\": [\n    {\n      \"deal_ticket\": 1234567890,\n      \"order_ticket\": 9876543210,\n      \"position_id\": 1122334455,\n      \"symbol\": \"XAUUSD\",\n      \"deal_type\": \"BUY\",\n      \"entry_type\": \"IN\",\n      \"deal_time\": 1753082400,\n      \"price\": 2050.50,\n      \"volume\": 0.10,\n      \"commission\": -2.50,\n      \"swap\": 0.00,\n      \"profit\": 125.80,\n      \"sl\": 2040.00,\n      \"tp\": 2060.00,\n      \"comment\": \"Test\",\n      \"magic\": 888888\n    }\n  ]\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": {
          "raw": "{{base_url}}/api/v1/ingest/deals",
          "host": ["{{base_url}}"],
          "path": ["api", "v1", "ingest", "deals"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:8000"
    },
    {
      "key": "secret_key",
      "value": "sk_test_abc123def456"
    },
    {
      "key": "mt5_login",
      "value": "88973405"
    }
  ]
}
```

### B. curl 测试命令

```bash
# 1. 获取最后同步时间
curl -X POST http://localhost:8000/api/v1/sync/last_sync_time \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_abc123" \
  -d '{"mt5_login": 88973405}'

# 2. 上传成交
curl -X POST http://localhost:8000/api/v1/ingest/deals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_abc123" \
  -d '{
    "mt5_login": 88973405,
    "server_gmt_off": 10800,
    "last_deal_time": 1753082400,
    "deals": [
      {
        "deal_ticket": 1234567890,
        "order_ticket": 9876543210,
        "position_id": 1122334455,
        "symbol": "XAUUSD",
        "deal_type": "BUY",
        "entry_type": "IN",
        "deal_time": 1753082400,
        "price": 2050.50,
        "volume": 0.10,
        "commission": -2.50,
        "swap": 0.00,
        "profit": 125.80,
        "sl": 2040.00,
        "tp": 2060.00,
        "comment": "Test",
        "magic": 888888
      }
    ]
  }'
```

---

**文档版本**：v2.0  
**最后更新**：2026-01-18  
**维护者**：TradeSync-Web 开发团队  
**反馈渠道**：api-feedback@tradesync.example.com
