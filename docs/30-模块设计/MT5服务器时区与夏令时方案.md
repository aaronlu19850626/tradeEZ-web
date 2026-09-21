# MT5 服务器时区与夏令时方案

版本：0.1；状态：待评审。

## 1. 目标

解决 MT5 券商服务器不使用北京时间、且服务器时区存在夏令时变化时，历史成交时间可能偏移 1 小时的问题。

系统对外仍统一按北京时间分日、分周和展示；本方案只修正“券商服务器本地时间到 UTC”的转换准确性。

## 2. 当前逻辑

1. MT5 的 `DEAL_TIME` 和开仓时间使用券商服务器本地时间。
2. EA 使用同步时的实时偏移转换：

   ```text
   UTC = 服务器时间 - (TimeTradeServer() - TimeGMT())
   ```

3. 后端只接收转换后的 UTC 秒。
4. 前端统一按 `Asia/Shanghai` 分组。

当前问题：

- 历史成交发生在另一个夏令时周期时，使用同步时偏移会偏差 1 小时。
- 后端无法从已转换的 UTC 时间反推出券商原始服务器时间。
- 不同券商服务器可能使用不同时区和夏令时规则，无法统一写死。

## 3. 目标数据模型

`accounts` 增加以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `server_timezone` | TEXT NULL | IANA 时区，例如 `Europe/London`、`America/New_York` |
| `server_utc_offset_seconds` | BIGINT NULL | 无 IANA 时区时使用的固定 UTC 偏移 |
| `timezone_source` | TEXT | `manual`、`connector`、`inferred`、`fallback` |

MT5 旧账户默认：

- `server_timezone = NULL`
- `server_utc_offset_seconds = NULL`
- `timezone_source = fallback`

## 4. EA 协议调整

### 4.1 成交事件

交易事件同时发送两套时间：

```json
{
  "open_time": 1789631000,
  "deal_time": 1789632000,
  "server_open_time": 1789638200,
  "server_deal_time": 1789639200,
  "server_gmt_offset": 7200
}
```

- `open_time`、`deal_time`：现有 UTC 时间，保持向后兼容。
- `server_open_time`、`server_deal_time`：MT5 原始服务器时间。
- `server_gmt_offset`：同步时的实时 UTC 偏移秒数。

### 4.2 心跳

心跳增加：

```json
{
  "server_gmt_offset": 7200,
  "server_timezone_name": "Europe/London"
}
```

EA 可增加可选参数 `Inp_BrokerTimezone`。未配置时，只上报实时偏移和服务器名称。

## 5. 后端转换优先级

### 5.1 配置了 IANA 时区

优先使用 `server_timezone` 和原始服务器时间：

```text
原始服务器时间 -> IANA 时区规则 -> UTC
```

这种方式可正确处理夏令时切换。

### 5.2 未配置 IANA，但 EA 上报实时偏移

使用 EA 上报的 `server_gmt_offset`：

```text
UTC = server_deal_time - server_gmt_offset
```

行为与当前版本一致，但只适用于固定偏移或同期数据。

### 5.3 无原始服务器时间

继续使用旧字段 `open_time`、`deal_time`，不做二次转换，保证兼容。

## 6. 账户 API

`AccountCreateIn` 和 `AccountUpdateIn` 增加：

- `server_timezone`
- `server_utc_offset_seconds`

新增账户时：

- MT5 默认留空，由心跳和用户设置补充。
- 固定偏移服务器可直接选择常见 UTC 偏移。
- IANA 时区用于有夏令时规则的服务器。

币种仍保持不可修改；时区允许用户修改，但修改后不自动重写历史，需通过“重置并重新同步”生效。

## 7. 前端

新增账户弹窗增加可选“交易服务器时区”：

1. 自动 / 跟随连接器
2. 常见固定偏移
3. IANA 时区

账户表暂不新增列，可在账户详情或编辑弹窗中查看。

当检测到：

- 已有历史成交
- 账户没有时区配置
- 券商可能使用夏令时

在账户页提供温和提示，但不阻塞现有同步。

## 8. 回填策略

历史成交无法安全自动改写。需要用户确认后：

1. 设置服务器时区。
2. 重置交易并选择开始日期。
3. 清空连接器事件、批次和游标。
4. 重新同步历史。

不提供静默重算，避免同一批交易被重复处理。

## 9. 测试

必须覆盖：

- 夏令时开始日和结束日边界。
- 欧洲、美国、英国、澳洲等不同夏令时规则。
- 固定 UTC 偏移。
- 无时区配置时回退到现有逻辑。
- 重置并重新同步后的时间一致性。
- 北京时间日切、周切和月度日历归属。

## 10. 开发阶段

1. 增加账户时区字段和 API。
2. 后端支持原始服务器时间和 IANA 时区转换。
3. EA 同时上报 UTC 时间、原始服务器时间和实时偏移。
4. 前端增加账户时区设置。
5. 对已有账户执行可选重同步。
6. 完成夏令时专项验收。

## 11. 验收标准

- 固定偏移服务器时间换算正确。
- 存在夏令时变化的服务器，历史成交在切换日前后均正确。
- 页面继续统一按北京时间展示。
- 旧 EA 和旧历史数据保持兼容。
- 重置前不静默改写历史，重置后重新同步结果一致。
