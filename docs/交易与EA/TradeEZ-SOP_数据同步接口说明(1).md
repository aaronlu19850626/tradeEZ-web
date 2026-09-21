# TradeEZ 数据同步接口说明

基线：`tradeEZSync.mq5` v1.00 与 `tradeEZ.mq5` v1.03，源码头部最后修改时间 2026-09-19 00:05（北京时间）。本文依据当前独立同步客户端代码整理，未检查服务端实现。字段为客户端实际发送字段；服务端数据库事务、唯一约束、错误码和认证容差仍需由后端实现及联调证明。主交易 EA 已移除所有 `WebRequest()`、手动同步和同步状态逻辑。

## 1. 通用协议

默认基础地址：`https://api.tradeez.cn`，可由 Inp_ApiBaseURL 修改。下面所有接口均为 POST，JSON 请求体，UTF-8 编码，不包含结尾 NUL 字节。URL 直接拼接基础地址与路径，应避免基础地址末尾多余斜杠。

### 请求头

| 字段 | 内容与含义 |
|---|---|
| Content-Type | application/json |
| Authorization | Bearer 加空格，再加完整 Inp_SecretKey |
| X-Timestamp | TimeGMT() 的 Unix UTC 秒，十进制字符串 |
| X-Signature | HMAC-SHA256 的 64 字符小写十六进制结果 |

签名规则：

```text
key     = UTF8(完整账户密钥)
message = UTF8(原始JSON请求体 + X-Timestamp的十进制文本)
signature = lowercase_hex(HMAC_SHA256(key, message))
```

拼接时没有分隔符、换行或额外空格。服务端应使用收到的原始 body 验签，不要先解析 JSON 再重新序列化；字段顺序、空白、转义及数字格式改变都可能导致签名不同。密钥不在 JSON 中上传，但作为 Bearer 头发送，因此生产环境应使用 HTTPS。时间戳过期窗口、防重放、密钥与账号绑定规则尚无法从客户端确定。

### 通用字段与单位

| 字段/类型 | 说明 |
|---|---|
| mt5_login：整数 | 当前 MT5 账户登录号；全部 7 个接口都有 |
| Unix 时间：整数 | UTC 秒，不是毫秒，也不是北京时间字符串 |
| ticket/position_id/order_id/magic | 以 JSON 整数发送，按 64 位处理；后端及前端避免经过不安全的浮点整数转换 |
| 金额 | MT5 账户货币值；当前协议没有 currency 字段，不应一律假定美元 |
| 价格 | 品种实际报价，不是标准点数量 |
| volume/lots | 手数 |

当前历史时间换算使用 ServerGmtOffset()；跨服务器夏令时等历史偏移变化需要额外核验，不能把它视作完整时区数据库转换。

### 成功响应判定

| 接口 | EA 接受的 HTTP 状态 | 是否解析响应 body |
|---|---|---|
| last_sync_time | 200–299，且能找到 last_sync_time 字段 | 是，简易字符串提取 |
| ingest/deals | 200–299 | 否，只记录日志 |
| update_last_sync_time | 200–299 | 否 |
| ingest/symbols | 仅 200 | 否 |
| ingest/snapshots | 仅 200 | 否 |
| ingest/settings | 200–299 | 否 |
| ingest/heartbeat | 仅 200 | 否 |

因此不能统一返回 201 或 204：部分接口会被 EA 判为失败。除游标查询外，HTTP 成功即被客户端视为成功，即使 body 写着业务失败也不会识别。建议后端仅在实际成功后返回成功状态；这是联调建议，不是已验证的后端行为。

## 2. 调度、串行执行与处理逻辑

### 2.1 独立同步服务

网络请求全部由独立的 `tradeEZSync.mq5` 执行。主交易 EA 只定期原子写入不含密钥的实例参数清单，不读取同步状态，也不参与手动或自动同步。同步服务允许账户有持仓时运行；即使 `WebRequest()` 超时，也只阻塞同步 EA 自身，不阻塞主 EA 的 Tick、Timer、图表按钮或动态风控。

同一账户在一个 MT5 数据目录内只允许一个同步 EA 获得本地租约。该租约不能覆盖另一台电脑或另一个 MT5 数据目录，跨终端并发必须由服务器端幂等和单调游标控制。

### 2.2 同步入口

| 入口 | 条件 | 行为 |
|---|---|---|
| 启动/每日完整同步 | 同步 EA 首次启动，或北京时间自然日编号变化 | 允许有持仓，执行完整同步 |
| 常规定时 | 同步服务启用且密钥非空 | 按到期优先级执行成交、快照、心跳或设置任务 |
| 手动同步 | 在同步 EA 面板点击“同步数据”，再点击“确认同步” | 允许有持仓，执行完整同步 |

完整同步顺序：

```text
品种规格 → 成交同步〔查询游标 → 收集 → 分批上传 → 提交游标〕
         → 账户快照 → 参数配置 → 心跳
```

前一个任务失败不会阻止后续任务执行；只有全部子任务成功，完整同步才显示成功。完整同步失败采用 5 秒、15 秒、60 秒、300 秒退避后重试。常规定时任务中，成交失败进入完整重试；快照、心跳和配置失败则在各自下一周期再次执行。

常规定时任务优先级：

| 顺序 | 任务 | 默认触发 |
|---|---|---|
| 1 | 成交同步 | 每 5 分钟 |
| 2 | 账户快照 | 每 30 秒 |
| 3 | 心跳 | 每 300 秒 |
| 4 | 参数配置 | 每 60 分钟 |

周期由 1 秒定时器累计，不承诺严格墙钟精度。当前版本不再检查空仓，也不再等待主面板空闲。

### 2.3 自动与手动不会在同一实例并发

MT5 对同一个 EA 的 `OnTimer()`、`OnChartEvent()` 和其他事件串行派发。自动同步执行 `WebRequest()` 时，点击事件只能排队，不能插入当前请求或当前批次：

1. 自动同步开始后，同步 EA 状态变为“正在同步”。
2. 同步期间的点击不会与自动任务并行执行。
3. 点击事件恢复处理时，仍须先进入手动二次确认；不会直接启动另一轮。
4. 已处于忙碌状态或成交同步锁定时，新的完整同步调用会被拒绝。

这是客户端单实例内的串行保证，不是服务器全局锁。跨终端、跨电脑或其他调用方仍可能并发请求同一账户。

### 2.4 单次请求与超时

每个请求使用同步 EA 的 `Inp_RequestTimeoutMS`。一轮完整同步包含多次 HTTP 请求，整轮耗时可能是单次超时的数倍。同步面板在请求前显示具体任务，成功或失败后更新状态；主交易面板不显示同步状态，也不会被同步遮罩。

`ingest/deals` 与 `update_last_sync_time` 是两个独立 HTTP 请求，并非跨请求原子事务。客户端只在全部成交批次返回成功后提交游标；服务器仍必须负责批次事务、成交幂等和游标单调更新。

## 3. 查询同步游标

**POST /api/v1/sync/last_sync_time**

请求：

```json
{"mt5_login":12345678}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| mt5_login | integer | 当前账号 |

客户端可识别的响应示例（示意协议形状，不是线上实测）：

```json
{"last_sync_time":0}
```

| 响应字段 | 类型 | 说明 |
|---|---|---|
| last_sync_time | integer | 最新已提交平仓成交时间，Unix UTC 秒；0 触发首次回溯 |

实际代码以平仓时间为游标，不是部分旧注释描述的开仓时间。解析器只查字段名、冒号及后续文本，并不是完整 JSON 校验；不要返回日期字符串、毫秒或非数字内容。字段存在但值非法可能被当成 0。

查询失败或游标为 0 时，客户端都回退到当前 UTC 时间前 7 天；查询失败不一定终止后续上传。未来游标超出可查询历史上限会使收集失败。

## 4. 上传成交

**POST /api/v1/ingest/deals**

### 4.1 请求结构

```json
{
  "mt5_login": 12345678,
  "deals": [{
    "ticket": 100001,
    "position_id": 90001,
    "order_id": 80001,
    "symbol": "GOLD#",
    "entry": 0,
    "type": 0,
    "volume": 0.40,
    "price": 4350.00000,
    "sl_price": 4346.50000,
    "tp_price": 4355.00000,
    "profit": 0.00,
    "swap": 0.00,
    "commission": -1.00,
    "magic": 920717,
    "comment": "TradeEZ-SC",
    "open_time": 1788220800,
    "deal_time": 1788220800
  }]
}
```

以上账号、票据、价格、时间均为示例，不表示实际成交。

| 字段 | 类型 | 来源/说明 |
|---|---|---|
| mt5_login | integer | 当前账户 |
| deals | array<object> | 成交记录数组，不是持仓数组、挂单数组或完整订单汇总 |
| deals[].ticket | integer | DEAL_TICKET，单笔成交唯一标识 |
| deals[].position_id | integer | DEAL_POSITION_ID，关联同一持仓生命周期 |
| deals[].order_id | integer | DEAL_ORDER，产生该成交的订单 |
| deals[].symbol | string | DEAL_SYMBOL，包含经纪商品种后缀 |
| deals[].entry | integer | DEAL_ENTRY 原始枚举值 |
| deals[].type | integer | DEAL_TYPE 原始枚举值，不是策略类型 |
| deals[].volume | number | DEAL_VOLUME，手数，序列化保留 2 位小数 |
| deals[].price | number | DEAL_PRICE，成交价格，保留 5 位小数 |
| deals[].sl_price | number | DEAL_SL，历史成交记录中的 SL，保留 5 位；不是实时最新 SL |
| deals[].tp_price | number | DEAL_TP，历史成交记录中的 TP，保留 5 位 |
| deals[].profit | number | DEAL_PROFIT，保留 2 位；未在此字段合并 swap/commission |
| deals[].swap | number | DEAL_SWAP，保留 2 位 |
| deals[].commission | number | DEAL_COMMISSION，保留 2 位 |
| deals[].magic | integer | DEAL_MAGIC；可供策略归属分析 |
| deals[].comment | string | DEAL_COMMENT，JSON 转义后的备注 |
| deals[].open_time | integer | 客户端推导的持仓最早开仓 UTC 秒；存在下述兜底问题 |
| deals[].deal_time | integer | 该笔成交发生的 UTC 秒 |

entry 常见值：0=IN 开仓，1=OUT 平仓，2=INOUT 反转，3=OUT_BY 对向平仓。type 常见 0=BUY、1=SELL；应按 MT5 枚举处理，不要把所有类型硬编码为买卖。卖出成交也可能是多单平仓，须联合 entry 判断。协议未上传独立 close_time、毫秒时间、fee、账户服务器名称或货币字段。

### 4.2 收集、分批、推进游标

1. 从游标至服务器当前时间+1秒选择历史。
2. 只用 DEAL_ENTRY_OUT、非零 position_id 的成交挑选目标持仓；边界是平仓时间 >= 游标。
3. 为目标 position_id 记录该窗口内最晚平仓时间，并搜索最早开仓时间。
4. 将历史窗口向游标之前扩展 30 天，收集目标 position_id 对应的所有可见成交，包括开仓、减仓、平仓。
5. 不按当前品种或本 EA 魔术号过滤：同步范围为全账户历史中符合上述条件的记录。
6. 按 Inp_MaxBatchSize 分批，默认 100，实际限制 1–1000 条成交/批；多个批次连续执行。
7. 任一批非 2xx 立即终止成交任务，不推进游标；已成功批次不回滚。
8. 全部批次成功后，单独提交目标记录最新平仓 UTC 秒。
9. 游标提交失败也判成交同步失败，下轮可能重传已上传记录。

无记录时：查询游标成功则任务成功且不提交新游标；查询失败且回退窗口也无记录则任务失败。

后端必须支持重传。建议以账户身份加成交 ticket 做幂等写入；账号是否需要同时结合交易服务器/租户身份，应由后端账户模型确定。批次可能拆开同一 position 的成交，不应假定单批就是完整持仓。客户端没有传 batch_id、总批数或事务 ID。

### 4.3 已知数据边界

- 有 OUT 就会选中 position，不核验是否仍有剩余仓位；部分减仓也会上传，不能据此认定完全平仓。
- 仅 INOUT 或 OUT_BY 的关闭路径可能不被目标选择覆盖。
- open_time 在扩展历史之前计算；找不到开仓时兜底为平仓时间，扩大历史后没有重新计算，可能与实际开仓成交时间冲突。
- 开仓早于扩展窗口可能缺失；首次 7 天回退不是全历史导入。
- 同秒边界刻意重传；后端必须去重，不能简单累加每次请求金额。
- volume 固定 2 位、价格固定 5 位可能截断特殊品种精度。
- 当前仅补发所选历史成交，不上传未成交挂单、实时持仓列表或 SL 修改事件。

## 5. 提交同步游标

**POST /api/v1/sync/update_last_sync_time**

```json
{"mt5_login":12345678,"last_sync_time":1788220800}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| mt5_login | integer | 当前账户 |
| last_sync_time | integer | 本轮全部成交批次成功后的最新平仓 UTC 秒 |

仅 HTTP 2xx 判断成功，不读取响应业务字段。成交上传和游标提交是两个独立 HTTP 请求，不是一个跨请求事务：成交已经写入但游标请求超时时，客户端不会回滚成交，而会在下轮幂等重传后再次提交游标。

服务端必须在成交批次完整持久化后才允许推进，并以单条原子语句执行 `GREATEST(当前游标, 候选游标)` 或等价单调更新。相同游标重复提交必须成功；较小候选值不得覆盖较大当前值。当前 EA 不传版本号、锁或比较条件，因此跨电脑、跨 MT5 数据目录和其他客户端的并发安全只能由服务器保证。

同一个同步 EA 内，自动任务和手动任务不会并行执行；这一点不能作为服务端省略幂等、唯一约束或单调更新的理由。

## 6. 上传品种规格

**POST /api/v1/ingest/symbols**

```json
{"mt5_login":12345678,"symbols":[{"name":"GOLD#","digits":2,"point":0.0100000000,"tick_value":1.00000,"contract_size":100.00}]}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| mt5_login | integer | 当前账户 |
| symbols | array<object> | 当前实现只含图表所在的一个品种 |
| symbols[].name | string | _Symbol，实际交易品种名 |
| symbols[].digits | integer | SYMBOL_DIGITS，报价小数位数 |
| symbols[].point | number | SYMBOL_POINT，原生报价点，保留 10 位 |
| symbols[].tick_value | number | SYMBOL_TRADE_TICK_VALUE，终端提供的跳动价值，保留 5 位 |
| symbols[].contract_size | number | SYMBOL_TRADE_CONTRACT_SIZE，每手合约量，保留 2 位 |

仅 HTTP 200 成功。没有 tick_size、账户货币、盈亏货币、最小手数/步长字段，因此仅凭本接口不足以通用精确复算所有品种盈亏。品种规格只传当前图表品种，而成交可含全账户其他品种，后端要处理规格缺失。

## 7. 上传账户快照

**POST /api/v1/ingest/snapshots**

```json
{"mt5_login":12345678,"snapshots":[{"balance":10000.00,"equity":10020.00,"margin":100.00,"free_margin":9920.00,"snapshot_time":1788220800}]}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| mt5_login | integer | 当前账户 |
| snapshots | array<object> | 当前实现每次一个快照 |
| snapshots[].balance | number | ACCOUNT_BALANCE，余额，2 位小数 |
| snapshots[].equity | number | ACCOUNT_EQUITY，净值，2 位小数 |
| snapshots[].margin | number | ACCOUNT_MARGIN，已用保证金，2 位小数 |
| snapshots[].free_margin | number | ACCOUNT_MARGIN_FREE，可用保证金，2 位小数 |
| snapshots[].snapshot_time | integer | 采样时 TimeGMT()，UTC 秒 |

范围为整个账户，不是当前品种。仅 HTTP 200 成功。正文采样时间与请求头时间分别获取，可能略有差异；签名使用请求头时间。客户端没有快照 ID，同秒重复/多实例快照的存储策略需后端约定。

## 8. 上传 EA 参数快照

**POST /api/v1/ingest/settings**

顶层结构：

```json
{"mt5_login":12345678,"snapshot_time":1788220800,"settings":{"basic":{},"risk":{},"scalp":{},"trend":{},"moat":{},"sync":{}}}
```

上例空对象只展示结构；实际请求发送以下全部字段。

| 字段 | 类型 | 说明 |
|---|---|---|
| mt5_login | integer | 当前账户 |
| snapshot_time | integer | 配置快照 UTC 秒，同时用于该请求签名 |
| settings | object | 当前实例输入参数的分类快照，不是实时风控状态 |

以下点数为策略标准点（1 点=0.01 价格单位），slippage 例外为品种原生报价点。百分比字段保留百分数值，50 表示 50%。number 格式保留 2 位小数；boolean 是 JSON true/false，不是字符串。

### settings.basic

| 字段 | 类型 | EA 参数 | 说明 |
|---|---|---|---|
| magic | integer | Inp_Magic | 基础魔术号 |
| magic_scalp | integer | Inp_MagicScalp | 剥头皮魔术号 |
| magic_trend | integer | Inp_MagicTrend | 趋势魔术号 |
| comment_scalp | string | Inp_CommentScalp | 剥头皮备注 |
| comment_trend | string | Inp_CommentTrend | 趋势备注 |
| slippage | integer | Inp_Slippage | 允许滑点，原生报价点 |
| refresh_seconds | integer | Inp_RefreshSeconds | 刷新/定时器输入间隔，秒 |
| ui_scale | number | Inp_UIScale | 界面缩放系数 |
| use_session | boolean | Inp_UseSession | 交易时段门控开关 |
| session_start | integer | Inp_SessionStartHour | 北京时间交易开始小时 |
| session_end | integer | Inp_SessionEndHour | 北京时间交易结束小时 |
| reset_hour | integer | Inp_ResetHour | 北京时间每日初始化小时 |
| reset_minute | integer | Inp_ResetMinute | 每日初始化分钟 |
| export_on_reset | boolean | Inp_ExportOnReset | 跨日重置前导出开关 |

### settings.risk

| 字段 | 类型 | EA 参数 | 说明 |
|---|---|---|---|
| daily_max_drawdown | number | Inp_DailyMaxDrawdown | 日亏损额度；实际不是峰值回撤 |
| daily_profit_target | number | Inp_DailyProfitTarget | 日盈利目标输入 |
| scalp_drawdown_ratio | number | Inp_ScalpDrawdownRatio | 剥头皮亏损额度占比，% |
| trend_drawdown_ratio | number | Inp_TrendDrawdownRatio | 趋势亏损额度占比，% |
| weekly_profit_target | number | Inp_WeeklyProfitTarget | 周盈利目标 |
| consec_loss_limit | integer | Inp_ConsecLossLimit | 连亏笔数阈值 |
| cooldown_minutes | integer | Inp_CooldownMinutes | 冷却分钟 |
| enable_circuit_breaker | boolean | Inp_EnableCircuitBreaker | 普通熔断开关 |
| alert_on_breaker | boolean | Inp_AlertOnBreaker | 熔断提示开关 |

### settings.scalp

| 字段 | 类型 | EA 参数 | 说明 |
|---|---|---|---|
| lots | number | Inp_ScalpLots | 剥头皮手数 |
| max_positions | integer | Inp_ScalpMaxPositions | 最大持仓数 |
| sl_points | integer | Inp_ScalpSL_Points | 初始止损标准点 |
| tp_points | integer | Inp_ScalpTP_Points | 初始止盈标准点 |
| be_trigger | integer | Inp_ScalpBETrigger | 峰值追踪激活标准点 |
| trail_step | integer | Inp_ScalpTrailStep | 峰值允许回撤标准点 |
| time_limit_on | boolean | Inp_ScalpTimeLimitOn | 超时强平开关 |
| max_hold_secs | integer | Inp_ScalpMaxHoldSecs | 最长持仓秒数 |

### settings.trend

| 字段 | 类型 | EA 参数 | 说明 |
|---|---|---|---|
| lots | number | Inp_TrendLots | 趋势手数 |
| max_positions | integer | Inp_TrendMaxPositions | 最大持仓数 |
| sl_points | integer | Inp_TrendSL_Points | 初始止损标准点 |
| be1_trigger | integer | Inp_TrendBE1_Trigger | 第一档保本触发标准点 |
| be2_trigger | integer | Inp_TrendBE2_Trigger | 第二档触发标准点 |
| be2_lock | integer | Inp_TrendBE2_Lock | 第二档锁盈标准点 |
| be3_trigger | integer | Inp_TrendBE3_Trigger | 第三档锁盈/减仓触发标准点 |
| be3_lock | integer | Inp_TrendBE3_Lock | 第三档锁盈标准点 |
| reduce_percent | number | Inp_TrendReducePercent | 减仓比例，% |
| trail_trigger | integer | Inp_TrendTrailTrigger | 尾随激活标准点 |
| trail_step | integer | Inp_TrendTrailStep | 峰值回撤标准点 |

### settings.moat

| 字段 | 类型 | EA 参数 | 说明 |
|---|---|---|---|
| enable | boolean | Inp_EnableProfitProtect | 利润护城河开关 |
| p1_trigger | number | Inp_ProfitProtect1_Trigger | 第一档盈利高点触发金额 |
| p1_percent | number | Inp_ProfitProtect1_Percent | 第一档回撤百分比；默认300实际表示300% |
| p2_trigger | number | Inp_ProfitProtect2_Trigger | 第二档盈利高点触发金额 |
| p2_amount | number | Inp_ProfitProtect2_Amount | 第二档回撤金额 |
| liquidation | number | Inp_ProfitLiquidation | 命名为清盘阈值，当前达到时锁开仓；不等同立即全平 |
| shutdown | number | Inp_ProfitShutdown | 盈利停止开仓阈值 |

### settings.sync

| 字段 | 类型 | EA 参数 | 说明 |
|---|---|---|---|
| enable | boolean | Inp_EnableSync | 数据同步开关 |
| api_base_url | string | Inp_ApiBaseURL | 接口基础地址 |
| sync_interval_min | integer | Inp_SyncIntervalMin | 成交同步间隔输入，分钟 |
| request_timeout_ms | integer | 同步 EA 的 Inp_RequestTimeoutMS | 单次 HTTP 请求超时输入，毫秒 |
| max_batch_size | integer | Inp_MaxBatchSize | 原始批量输入；实际发送限制为1–1000 |
| debug | boolean | Inp_DebugSync | 调试日志开关 |

共 55 个 settings 叶子字段。`basic/risk/scalp/trend/moat` 由主 EA 发布到本地无密钥实例清单，`sync` 由独立同步 EA 在发送前补充。同步密钥不会进入 settings、实例清单或普通日志。

当前兼容接口顶层仍只有 `mt5_login/snapshot_time/settings`。同步 EA 会从同一账户的本地清单中选择修改时间最新的一份上传，历史清单不会在同一轮逐份提交。接口尚未携带 symbol、instance_id、EA 版本或配置 ID；同账号多个活跃交易实例的精确区分仍依赖后端 schema 升级。

## 9. 心跳

**POST /api/v1/ingest/heartbeat**

```json
{"mt5_login":12345678}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| mt5_login | integer | 当前账户 |

仅 HTTP 200 成功。正文没有时间、版本、连接状态或品种；请求头有签名时间。后端可记录接收时间作为在线依据。独立同步 EA 不再受空仓或主面板空闲限制，但网络超时、退避重试、终端关闭和同步 EA 被移除仍可能造成心跳间隔扩大，因此离线判定应保留合理宽限期。

## 10. 联调与服务端处理建议（非已验证实现）

1. 先验证 HTTPS、账号授权、原始 body HMAC 与时间戳，再处理业务；不要在日志中暴露 Bearer 密钥。
2. 所有接口可统一以 200 返回成功；游标查询额外返回明确数字 last_sync_time，避免客户端状态码差异。
3. 成交采用幂等 upsert；成功状态只能在整个批次实际持久化后返回，否则客户端可能错误推进游标。
4. 游标单调递增，并考虑同账号多实例并发；不以单个请求顺序保证全局顺序。
5. 后端重建交易时优先使用 entry、deal_time、position_id，不盲信 open_time 或把收到 OUT 当成已完全平仓。
6. 对精度、币种、交易服务器身份、跨时区、缺失品种规格制定明确规则。
7. 测试“第2批失败”“批次成功但游标失败”“同秒重复成交”“部分平仓后继续持仓”“查询失败回退7天”“仅挂单时同步中成交”。
8. 检查服务端是否返回 HTTP 200 搭配业务错误；当前 EA 不解析此类错误，必须明确兼容约定。
9. 当前客户端无独立哈希校准、服务端拉取配置、全历史补录或撤销成交接口，不能在复盘系统中假定这些能力已存在。

## 11. 源码定位

| 功能 | 函数 |
|---|---|
| 请求超时、遮罩与错误保存 | SyncRequestTimeout / SyncWebRequest |
| 签名 | ComputeHMAC / SyncHeaders |
| 游标查询 | GetServerLastSyncTime |
| 成交收集 | CollectDealsAfterCloseTime |
| 上传批次 | UploadDealsBatch |
| 游标提交 | UpdateServerLastSyncTime |
| 成交任务编排 | SyncDeals |
| 品种/快照/配置/心跳 | SyncSymbols / SyncSnapshot / SyncSettings / SyncHeartbeat |
| 完整同步与定时调度 | RunFullDataSync / OnTimer |

补充阅读：[操作手册](TradeEZ-SOP_操作手册.md)、[功能分析](TradeEZ-SOP_功能分析与待验证问题.md)、[输入默认值](TradeEZ-SOP_参数默认值.md)。
