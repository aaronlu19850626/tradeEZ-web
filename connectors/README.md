# TradeEZ Connectors

版本：1.0；状态：已生效。

本目录保存各交易平台的客户端、探针、安装脚本和协议版本。

## MT5

| 路径 | 用途 |
|---|---|
| `mt5/sync/v1/` | 旧协议 MT5 同步客户端，只做兼容维护 |
| `mt5/sync/v2/` | 统一连接器协议 MT5 同步客户端 |
| `mt5/probe/` | MT5 环境探针和诊断 EA |
| `mt5/scripts/` | MT5 安装和 WebRequest 配置脚本 |

## 后续平台

- `mt4/`
- `ctrader/`
- `atas/`
- `ctp/`

新平台必须通过 `backend/app/connectors/` 的统一握手、游标和事件批次协议接入，不在平台客户端中自行定义业务表结构。
