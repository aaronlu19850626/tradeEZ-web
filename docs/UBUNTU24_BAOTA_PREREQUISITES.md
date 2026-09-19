# Ubuntu 24.04 LTS + 宝塔：部署前准备

本项目是 Next.js 16 / React 前端、FastAPI / Uvicorn 后端和 PostgreSQL 数据库。数据库在宝塔中安装 **PostgreSQL 18**，正式后端通过 `127.0.0.1:5432` 连接。

| 组件 | 建议 | 安装位置 / 用途 |
| --- | --- | --- |
| Nginx | 宝塔当前受维护的安全更新版本 | 宝塔软件商店；HTTPS 与反向代理 |
| Node.js + npm | Node.js 24 LTS 最新补丁 | 宝塔 Node 版本管理器；同时设置命令行版本 |
| Python | Ubuntu 系统 Python 3.12 | 后端独立 venv；不要使用宝塔面板自身的 Python 环境 |
| Python venv | python3.12-venv | 隔离安装 requirements.txt；venv 内自带 pip |
| Git、curl、ca-certificates、tzdata | 系统更新版本 | 代码、下载、证书链和时区 |
| PostgreSQL | 18.x | 宝塔 PostgreSQL 18；应用数据库、备份和测试库 |
| PostgreSQL client | 与服务器大版本一致（18.x） | `pg_dump` / `pg_restore` 运维脚本 |
| systemd | Ubuntu 已提供 | 前后端进程守护和开机启动，无需重复安装 PM2/Supervisor |

在宝塔安装 Nginx、Node.js 与 PostgreSQL 18；不要另外用 apt 安装第二套 Nginx。

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv git curl ca-certificates tzdata
node --version
npm --version
python3.12 --version
psql --version
```

如果宝塔安装的 PostgreSQL 18 没有把 18 版客户端工具放入 PATH，应优先使用宝塔 PostgreSQL 18 自带的 `pg_dump` / `pg_restore`，避免低版本客户端备份高版本数据库。

应用依赖部署时按仓库锁定版本安装：前端使用 npm ci（构建阶段包含开发依赖），后端在独立 venv 中安装 requirements.txt。不要复制 Windows 的 node_modules 或 venv 到 Linux。Node 24 / Python 3.12 是目标环境选择。

仅当安装依赖需要从源码编译时，再补 build-essential、python3.12-dev、libssl-dev、libffi-dev 等编译依赖，按实际错误确定。本项目当前不需要 MySQL、Redis、PHP、Docker，也不需要在 Ubuntu 安装 MT5；EA 继续运行在 MT5 终端所在电脑。

部署结构：公网 HTTPS 443 由宝塔 Nginx 接收；页面转发至 127.0.0.1:3000；/api/v1/ 转发至 127.0.0.1:8000。前后端使用 systemd 分别运行。正式环境使用 next build + next start，不运行 next dev。3000、8000 和 PostgreSQL 5432 都只供本机访问；公网迁移测试可临时放行 5432 到当前办公 IP，完成后立即关闭。正式域名与前端构建变量在部署阶段统一配置。

还需准备域名、HTTPS 证书、阿里云短信 RAM 凭据/已审核签名与验证码模板、SMTP 发信服务及发件人身份。正式环境设置：

```env
TRADESYNC_DATABASE_URL=postgresql://tradeez:<password>@127.0.0.1:5432/tradeez
TRADESYNC_ENVIRONMENT=production
TRADESYNC_AUTH_TEST_MODE=false
TRADESYNC_DEV_FIXED_LOGIN_CODE=
```

使用阿里云短信和 SMTP 发送随机验证码。配置独立认证密钥、同步密钥加密密钥和精确 CORS 域名。从旧 SQLite 迁移时必须保留原 `TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET`，否则无法解密已绑定 EA 的密钥。密钥不应放进前端构建变量。

数据库及备份放在非公开目录。PostgreSQL 备份使用 `scripts/backup_database.py` 或同版本 `pg_dump --format=custom`，恢复前先确认目标库，因为恢复流程会 DROP/CREATE 目标数据库。首次从旧库迁移时先运行 `scripts/migrate_sqlite_to_pg.py`，脚本会自动创建一份 SQLite 备份，再复制数据并校验行数。

参考官方资料：

- [Node.js 版本与维护周期](https://nodejs.org/en/about/previous-releases)
- [Ubuntu 24.04 Python 3.12 venv](https://packages.ubuntu.com/en/noble-updates/python3.12-venv)
- [宝塔 Next.js 部署说明](https://docs.bt.cn/practical-tutorials/nextjs-deploy)
- [宝塔安装 Web 服务器](https://docs.bt.cn/user-guide/site/install-webserver)

截图依赖 Pillow，已锁定在 requirements.txt，无需单独安装图床。Nginx 站点部署时将 client_max_body_size 设为 6m，应用仍执行单图 5 MB 限制；PostgreSQL 自定义格式备份包含截图 BYTEA 数据。
