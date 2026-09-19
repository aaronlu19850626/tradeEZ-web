# 服务端模块化进度（2026-09-18）

最新进展：已增加独立 Trade 生命周期持久化、反转拆分、成交费用分摊、变更持仓重建和 SQL 分页；迁移 `0002_trade_lifecycles` 已在备份后的实际库执行。54 项测试和 EA 冒烟通过。详见 [Trade 生命周期](TRADE_LIFECYCLES.md)。

最新覆盖：已按 SOP v1.03 的平仓时间游标和最小请求完成七接口对齐，49 项后端测试与冒烟测试通过。下文记录包含旧阶段历史，当前行为以 [SOP 对齐记录](SOP_CONTRACT_ACCEPTANCE.md) 为准。订单归并已补充 OUT_BY、开仓费用、真实 IN 时间和待核对状态。

本次完成 M0/M1 的 EA 同步模块拆分，保持七个接口路径、请求模型、响应模型及 V2.1/V2.2 同步协议兼容。

## 当前边界

| 模块 | 职责 |
|---|---|
| `backend/app/sync/router.py` | HTTP 参数、签名鉴权、限流，调度同步服务到线程池 |
| `backend/app/sync/auth.py` | Bearer Key、HMAC、签名时间窗与兼容 Key 校验 |
| `backend/app/sync/service.py` | 七个同步操作、业务校验、事务提交及回滚 |
| `backend/app/sync/repository.py` | 批次、轮次、实例和成交关联持久化；事务内刷新账号状态 |
| `backend/app/accounts/policies.py` | 账号是否允许同步的共享策略 |
| `backend/app/accounts/router.py` | Web 账号创建、列表、详情、修改及 Key 轮换接口 |
| `backend/app/accounts/service.py` | 账号归属检查、Key 生成、响应组装及写事务 |
| `backend/app/accounts/repository.py` | 账号与统计查询、绑定与 Key 更新、更新字段白名单 |
| `backend/app/web_auth/router.py` | 验证码发送、验证码登录及当前用户接口 |
| `backend/app/web_auth/service.py` | 验证码冷却/次数校验、单次消费、用户登录及事务 |
| `backend/app/web_auth/repository.py` | 验证码和用户登录数据持久化 |
| `backend/app/common/rate_limit.py` | 进程内限流与线程锁 |
| `backend/app/common/encoding.py` | 规范 JSON、摘要与 UTC 时间工具 |
| `backend/app/v2_api.py` | 原模块的兼容导出；新代码使用上述模块 |
| `backend/app/facts/router.py`、`service.py`、`repository.py` | 原始成交列表、成交详情与批次来源、EA 配置查询 |
| `backend/app/trades/aggregation.py` | 无数据库依赖的现有持仓归并函数 |
| `backend/app/trades/router.py`、`service.py`、`repository.py` | 持仓与订单视图、筛选、稳定排序及账号数据读取 |
| `backend/app/sync/query_router.py`、`queries.py`、`query_repository.py` | 同步轮次及审计日志查询 |

服务仍返回显式 Pydantic 响应模型。Service 不依赖 Request/Header/Depends，可在测试中直接调用。每个请求独占 SQLite 连接，业务操作在线程池内串行使用该连接，禁止在同一连接上并行执行多个操作。

## 事务与并发

- Service 负责事务，批次持久化函数不自行提交。
- 写入先取得 `BEGIN IMMEDIATE` 锁，再读取账号当前状态、Key 状态及游标，避免鉴权后等待执行期间使用陈旧数据。
- 游标更新使用锁内读取的值，较旧请求不会覆盖已推进的游标。
- 批次中的成交、批次回执、关联及轮次计数一起提交；中途失败全部回滚。
- 限流仍为进程内实现；鉴权和审计中的数据库访问仍需后续整理，不能把本次拆分视作多进程生产部署完成。
- Web 账号写操作先锁定再检查账号归属及重复绑定；并发绑定只产生一个账号，其余请求返回 409。
- 验证码发送和消费先取得写锁，避免并发绕过冷却或重复消费。错误尝试计数独立提交，达到 5 次即失效；用户创建失败则回滚验证码消费。
- 补发验证码会使之前未消费的验证码失效，避免新验证码用完后回退使用旧验证码。
- 邮件发送在验证码记录提交之后执行，不持有 SQLite 写锁等待 SMTP；SMTP 失败返回 502，已写入的发送记录仍计入冷却和频率限制。

## 验证与本地运行

在 `backend/` 执行：

```powershell
.\venv\Scripts\python.exe -m pytest -q tests
.\venv\Scripts\python.exe scripts/v2_smoke_test.py
```

测试夹具使用每次运行独立的临时数据库，并正常退出 TestClient；不再使用 `os._exit` 跳过 pytest 清理或剩余测试。若 Windows 拒绝创建 pytest 缓存，应修复运行账户对项目目录的权限。

新增回归覆盖批次写入中途失败回滚、旧轮次拒绝、陈旧游标保护以及七个 EA 接口拒绝停用账号。V2.1 冒烟检查逐项验证必需响应字段，允许 V2.2 追加字段。

Web 拆分阶段新增账号越权拒绝、只在创建/轮换响应展示 Key、Key 轮换立即失效、停用/恢复、并发绑定、并发验证码单次消费、补发失效、尝试次数和登录事务失败回滚测试。测试邮件全部由桩函数接收，不发送真实邮件。

查询模块阶段共 41 项测试通过。新增跨账号相同 ticket/时间的稳定分页、原始成交/配置/持仓查询越权拒绝、同步轮次隔离，以及部分平仓、跨日持仓、同向独立持仓和仅平仓记录的兼容测试。审计日志允许用户查看自己的被拒绝请求，同时不返回其他用户的同步记录。

成交详情接口为 `GET /api/v1/my/accounts/{account_id}/deals/{ticket}`，使用 Web 登录态并检查账号归属。响应包含 `deal`、`source_batches`、`source_total`、`page`、`page_size`。来源按接收时间与批次 ID 稳定倒序分页，默认 20 条、最多 100 条；旧版无批次上传返回空来源列表。来源中的 `status` 是批次接收状态，不等同于轮次游标提交状态。

同步轮次详情接口为 `GET /api/v1/my/sync-runs/{run_id}?page=1&page_size=20`，返回 `run`、`batches`、`total`、`page`、`page_size`，页大小最多 100。轮次归属校验失败统一返回 404，批次只返回标识、计数、状态、重试次数及时间，不返回订单内容或上传摘要。同步日志页面抽屉已接入，支持分页、刷新、加载、失败重试及旧 EA 无批次记录说明；切换轮次会重置分页并忽略旧请求结果。41 项后端回归包含该接口的权限、分页、重试计数及返回字段检查。

归并模块仍是旧持仓视图，保持原统计口径；它不是完整 Trade 生命周期模型。INOUT 反向、OUT_BY、数量不平、开仓费用分配和待核对状态仍需正式 Trade 构建器处理。订单视图当前仍在内存归并后分页，大数据量下需要后续持久化 Trade 和 SQL 分页。

## 后续范围

1. Alembic baseline 已完成：`app/migrations.py` 统一启动和 CLI 迁移，`migrations/versions/0001_sync_baseline.py` 固化旧库兼容升级；操作见 [数据库迁移与恢复](DATABASE_MIGRATIONS.md)。后续结构变化继续增加 revision。
2. 继续把 Service 内剩余 SQL 移入 Repository；本次已提取批次存储，尚未完成全部事实数据 SQL 分离。
3. Web 账号、认证、事实查询、同步日志查询和持仓归并已拆分；`main.py` 仍保留旧协议兼容接口，JWT 编解码及当前用户依赖仍在 `security.py`。后续重点是正式 Trade 构建器与待核对状态。
4. 扩展并发上传、Key 轮换、账号删除及真实 EA 局域网联调验收。

模块拆分阶段没有结构变更；后续迁移阶段新增 `alembic_version` 版本记录，并按需补齐旧库字段。本机预览启动前已备份实际库到 `backups/before-preview-20260918-153627.sqlite`，实际库已升级到 `0001_sync_baseline`，新版后端已在 127.0.0.1:8000 运行。

## EA 本机接入收尾

新增 `start-local-preview.ps1`，同时设置网页和 EA 的 API 环境变量，避免本机 HTTP 8000 预览继续显示未运行的 HTTPS 8443 地址。脚本不修改局域网环境文件，不自动终止已有进程。已实际运行并确认网页登录页与后端健康检查响应正常。

账号页提供主 EA 参数模板、WebRequest 白名单和同机访问说明；创建/重置时可复制含完整 Key 的参数。修复重置 Key 后因账号对象刷新而清空新密钥的问题，切换账号时清理密钥状态，异步完成的旧账号操作不重新打开抽屉。操作说明见 [EA 本机接入](EA_LOCAL_SETUP.md)。这轮未修改后端协议，未进行真实 MT5 终端联调；也不代表正式 Trade 构建器或公网部署已完成。
