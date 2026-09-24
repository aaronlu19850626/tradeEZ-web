---
doc_id: RUNTIME-EA
status: active
owner: connector-owner
last_verified: 2026-09-24
---

# EA 运行与配置

EA 的服务器、Sync Key、API 地址、TLS、时间、批量和日志配置必须与[EA 同步协议](../40-架构与数据/EA同步协议.md)和当前代码版本一致。安装、编译和本机操作只记录必要步骤；密钥、`.ex5`、证书和日志不得进入 Git。

配置变更必须通过连接器 Issue 和契约测试；不同环境使用不同 Key、数据库和 API 地址。健康检查、重复同步、失败重试、游标推进和账户隔离必须在隔离测试环境验证后再进入生产测试环境。
