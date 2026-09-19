# EA 同步握手 V2.2（批次确认）

本文档说明在不破坏现有 EA 七接口的前提下，新增的可选同步握手字段。旧 EA 不传这些字段时仍按 V2.1 两阶段同步处理。

## 1. 握手开始

`POST /api/v1/sync/last_sync_time`

请求仍可只传：

```json
{ "mt5_login": 123456 }
```

新 EA 可传：

```json
{
  "mt5_login": 123456,
  "instance_id": "mt5-terminal-01",
  "instance_name": "办公室电脑 MT5",
  "protocol_version": "2.2",
  "ea_version": "2.2.0"
}
```

响应新增字段：

```json
{
  "last_sync_time": 1758186000,
  "account_status": "active",
  "sync_run_id": 101,
  "cursor": 1758186000,
  "protocol_version": "2.2",
  "min_protocol_version": "2.1",
  "capabilities": [
    "hmac_sha256",
    "idempotent_batches",
    "two_phase_cursor",
    "batch_handshake_v2"
  ],
  "max_batch_size": 1000
}
```

每次握手会使同一账号之前未提交的 `open` 轮次变为 `expired`。EA 应保存本次返回的 `sync_run_id`，后续所有批次和游标提交都使用它。

## 2. 上传成交批次

`POST /api/v1/ingest/deals`

在原请求上追加以下可选字段：

```json
{
  "mt5_login": 123456,
  "server_gmt_off": 0,
  "sync_run_id": 101,
  "batch_id": "20260918-123456-0000",
  "batch_index": 0,
  "batch_count": 3,
  "instance_id": "mt5-terminal-01",
  "protocol_version": "2.2",
  "request_hash": "sha256-of-canonical-deals-array",
  "deals": []
}
```

规则：

1. `batch_id` 在同一账号内唯一，建议包含时间、轮次和批次序号。
2. `batch_index` 从 0 开始，必须小于 `batch_count`。
3. 相同 `batch_id` 可以安全重试；请求体必须完全一致。
4. 相同 `batch_id` 使用不同批次内容返回 `BATCH_CONTENT_CONFLICT`。
5. 成交仍按 `(account_login, ticket)` 幂等。
6. 批次写入和游标推进仍保持两个独立阶段，批次上传成功不代表游标立即推进。

响应：

```json
{
  "accepted": 100,
  "inserted": 90,
  "updated": 1,
  "duplicates": 9,
  "duplicated": 9,
  "rejected": 0,
  "pending_cursor": 1758186600,
  "sync_run_id": 101,
  "batch_id": "20260918-123456-0000",
  "batch_status": "received",
  "handshake": "batch_received",
  "replayed": false
}
```

重复重试同一个批次时 `replayed=true`，本次请求的 `inserted=0`、`duplicates=批次内成交数`，数据库不会新增重复成交。

## 3. 提交游标并确认整轮传输

全部批次上传后调用：

`POST /api/v1/sync/update_last_sync_time`

```json
{
  "mt5_login": 123456,
  "last_sync_time": 1758186600,
  "sync_run_id": 101,
  "batch_count": 3,
  "deal_count": 300
}
```

服务端会检查：

- 轮次属于该账号且仍为 `open`；
- 0 到 `batch_count - 1` 的批次均已收到；
- 所有批次状态为 `received`；
- 批次引用的成交数量与 `deal_count` 一致；
- 新游标不超过当前时间；
- 推进游标时，服务端能在已接收成交中找到对应的 `open_time`。

成功响应：

```json
{
  "last_sync_time": 1758186600,
  "updated": true,
  "sync_run_id": 101,
  "handshake_confirmed": true,
  "batches_received": 3,
  "batches_expected": 3,
  "deals_received": 300,
  "checksum_valid": true
}
```

批次缺失时返回 `409 SYNC_BATCHES_MISSING`，游标不推进，EA 可补传缺失批次后再次提交。轮次已过期、哈希不一致或账号停用均会明确拒绝。

## 4. 无新增交易

没有新增成交时，EA 仍可完成一次成功握手：

```json
{
  "mt5_login": 123456,
  "last_sync_time": 1758186000,
  "sync_run_id": 101,
  "batch_count": 0,
  "deal_count": 0
}
```

当提交游标不高于当前游标时，`updated=false`，但轮次可标记成功；系统只记录一次同步成功，不制造虚假新增订单。

## 5. 日志安全边界

同步日志记录接口、账号、轮次、批次、数量、结果、耗时、追踪 ID 和错误原因；不保存价格、手数、盈亏、止损、止盈、验证码、同步 Key、Token、HMAC 等敏感内容。业务订单明细只能通过鉴权后的原始成交/订单接口查询。
