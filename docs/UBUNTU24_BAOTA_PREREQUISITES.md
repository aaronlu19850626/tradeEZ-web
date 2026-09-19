# Ubuntu 24.04 LTS + 宝塔：部署前准备

本项目是 Next.js 16 / React 前端、FastAPI / Uvicorn 后端和 SQLite 数据库。以下为预安装清单，尚未在目标 Ubuntu 服务器完成安装和联调。

| 组件 | 建议 | 安装位置 / 用途 |
| --- | --- | --- |
| Nginx | 宝塔当前受维护的安全更新版本 | 宝塔软件商店；HTTPS 与反向代理 |
| Node.js + npm | Node.js 24 LTS 最新补丁 | 宝塔 Node 版本管理器；同时设置命令行版本 |
| Python | Ubuntu 系统 Python 3.12 | 后端独立 venv；不要使用宝塔面板自身的 Python 环境 |
| Python venv | python3.12-venv | 隔离安装 requirements.txt；venv 内自带 pip |
| Git、curl、ca-certificates、tzdata | 系统更新版本 | 代码、下载、证书链和时区 |
| sqlite3 | 系统版本，运维工具 | 当前数据库是 SQLite 文件；Python 自带 sqlite3 模块 |
| systemd | Ubuntu 已提供 | 前后端进程守护和开机启动，无需重复安装 PM2/Supervisor |

在宝塔安装 Nginx 与 Node.js；不要另外用 apt 安装第二套 Nginx。

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv git curl ca-certificates tzdata sqlite3
node --version
npm --version
python3.12 --version
```

应用依赖部署时按仓库锁定版本安装：前端使用 npm ci（构建阶段包含开发依赖），后端在独立 venv 中安装 requirements.txt。不要复制 Windows 的 node_modules 或 venv 到 Linux。Node 24 / Python 3.12 是目标环境选择，目标机安装和兼容性验证仍需执行。

仅当安装依赖需要从源码编译时，再补 build-essential、python3.12-dev、libssl-dev、libffi-dev 等编译依赖，按实际错误确定。本项目当前不需要 MySQL/PostgreSQL、Redis、PHP、Docker，也不需要在 Ubuntu 安装 MT5；EA 继续运行在 MT5 终端所在电脑。

部署结构：公网 HTTPS 443 由宝塔 Nginx 接收；页面转发至 127.0.0.1:3000；/api/v1/ 转发至 127.0.0.1:8000。前后端使用 systemd 分别运行。正式环境使用 next build + next start，不运行 next dev。3000 和 8000 只供本机反向代理访问，正式域名与前端构建变量在部署阶段统一配置。

还需准备域名、HTTPS 证书、阿里云短信 RAM 凭据/已审核签名与验证码模板、SMTP 发信服务及发件人身份。正式环境设置 TRADESYNC_ENVIRONMENT=production、TRADESYNC_AUTH_TEST_MODE=false，并清空 TRADESYNC_DEV_FIXED_LOGIN_CODE；使用阿里云短信和 SMTP 发送随机验证码，配置示例见 [手机号与邮箱登录](PHONE_EMAIL_AUTH.md)。配置独立认证密钥、同步密钥加密密钥和精确 CORS 域名。迁移已有数据库时必须保留原同步密钥加密密钥，否则无法解密已绑定 EA 的密钥。密钥不应放进前端构建变量。

数据库及备份放在非公开目录。SQLite 在线备份使用备份接口或 sqlite3 .backup，不能仅复制运行中的主数据库文件而忽略 WAL。先备份再执行 Alembic 迁移。

参考官方资料：

- [Node.js 版本与维护周期](https://nodejs.org/en/about/previous-releases)
- [Ubuntu 24.04 Python 3.12 venv](https://packages.ubuntu.com/en/noble-updates/python3.12-venv)
- [宝塔 Next.js 部署说明](https://docs.bt.cn/practical-tutorials/nextjs-deployment)
- [宝塔安装 Web 服务器](https://docs.bt.cn/user-guide/site/install-webserver)

截图依赖 Pillow，已锁定在 requirements.txt，无需单独安装图床。Nginx 站点部署时将 client_max_body_size 设为 6m，应用仍执行单图 5 MB 限制；SQLite 备份包含截图数据。
