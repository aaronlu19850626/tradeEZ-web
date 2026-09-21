# 数据库版本迁移

服务启动通过 Alembic 升级至 head，当前版本为 `0014_daily_reviews`，基线为 `0001_sync_baseline`。空库创建全部表；无版本号的旧库补齐原有兼容字段、索引和同步轮次表，并保留用户、账号、Key 密文和成交数据。已具备全部结构但尚未版本化的数据库也可直接升级。

基线固化原有历史数据修正：缺失开仓时间以成交时间回填、成交时区归零、没有时区名称的旧零偏移心跳标记为未知。这些修正只执行一次。已有版本号时不会重新扫描、修补或覆盖数据；不能把删掉版本表当作修复方法。

## 升级

在 `backend/` 目录运行，数据库路径沿用 `.env` 或 `TRADESYNC_DB_PATH`。首次应用到实际数据库前先停止写入并备份。下面路径应替换为实际数据库路径。

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe scripts/backup_database.py data/tradesync.db backups/before-baseline.sqlite
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m alembic current
```

备份使用 SQLite backup API，包含已提交 WAL 内容，并执行完整性检查；目标文件存在时拒绝覆盖。空库初始化不需要先备份。不要在未检查真实结构的情况下执行 `alembic stamp head`。

事务在版本检查前取得 `BEGIN IMMEDIATE` 锁，迁移 SQL 与版本号一起提交；进程内另以锁避免 Alembic 全局上下文冲突。失败会回滚本次结构和数据修改，修复原因后可重新升级。当前仅支持 SQLite 在线迁移，`--sql` 离线导出不支持旧库结构探测。

多个进程同时初始化空库时，WAL 模式切换可能立即返回 BUSY/LOCKED；连接初始化对这两类错误进行限时重试，其他数据库错误直接抛出。回归测试包含五组独立空库的双进程 CLI 同时升级。

## 恢复

基线包含历史数据转换，不能无损自动降级，`downgrade base` 会明确拒绝执行，不删除业务表。

1. 停止所有访问该数据库的后端、脚本和 EA 同步入口。
2. 保留当前数据库及对应 `-wal`、`-shm` 文件用于诊断。
3. 将升级前备份放到一个新的数据库路径；不要把备份覆盖到仍有旧 WAL 文件的路径。
4. 配置旧版本服务的 `TRADESYNC_DB_PATH` 指向恢复后的新路径，再启动旧版本服务。若启动本次新版服务，它会再次自动执行基线升级。
5. 核对账号、成交数量、游标及 Key 访问情况。

## 后续迁移约定

- 已发布 revision 不再修改；新变化增加下一个 revision。
- 迁移不得依赖可变的应用模型或当前 Service 代码。
- 新 migration 必须提供升级和恢复说明，以及新库、旧库、重复启动和失败回滚测试。
- 不使用 `sqlite3.executescript()` 包裹迁移，它会破坏外层显式事务；基线逐条执行完整 SQL 语句。
- 目前没有 ORM metadata，手工编写 migration；不宣称支持自动生成或 PostgreSQL。

实现参考 [Alembic 共享连接方式](https://alembic.sqlalchemy.org/en/latest/cookbook.html#sharing-a-connection-across-one-or-more-programmatic-migration-commands) 与 [SQLAlchemy SQLite 事务说明](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html)。
