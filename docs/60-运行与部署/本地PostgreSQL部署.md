# 本地 PostgreSQL 版部署记录

版本：历史机器记录；状态：不作为当前环境操作手册；用途：追溯一次本地 PostgreSQL 切换与排查；维护人：环境负责人；验收入口：当前《本地开发与联调》和实际健康检查。

本文包含过期提交号、机器状态和当时阻塞信息。新模型不得按本文恢复环境或判断当前 Git 状态。

## 最新验证结果

远程访问规则已生效。已只读验证数据库版本为 `0023_trade_dirty_triggers`，并后台重启本项目的前后端。
后端 `/health` 返回 `{"status":"ok"}`；认证配置 `test_mode=true`；前端 `/auth/v2/login` 返回 HTTP 200。
运行地址为 http://localhost:3000 和 http://127.0.0.1:8000 。GitHub 与本地 main 均为 e394961。
以下原阻塞信息作为历史排查记录保留，不代表当前状态。

- GitHub main 已从 2609c98 快进至 e394961；本地需求文档保留。
- 已安装 psycopg / psycopg-binary 3.3.5。
- 远程数据库配置存于 Git 忽略的 backend/.env，本文不记录密码。
- 开发登录使用固定验证码 123456（AUTH_TEST_MODE=true）；仍需先点击获取验证码创建有效记录。
- 前端 http://localhost:3000/auth/v2/login 已验证 HTTP 200。
- PostgreSQL 连接被服务端 pg_hba.conf 拒绝：当前客户端出口 120.86.255.204，目标 database/user 均为 tradesyz。
- SSL require 检查显示服务器不支持 SSL。
- 尚未运行数据库初始化、迁移或导入，未更改远程数据；后端新版未完成启动验证。

## 解除阻塞

数据库管理员需为上述客户端、数据库及用户配置最小范围的访问规则并重载 PostgreSQL 配置；如启用 SSL，客户端连接方式须同步调整。不要开放所有来源。

## 后续验证

1. 只读验证远程连接及 alembic_version。
2. 检查现有 schema 后按仓库启动流程启动后端。
3. 验证健康检查、前后端接口和开发登录配置。

当前部署范围为本地应用连接远程数据库；未执行远程 Web 服务器发布。旧 SQLite 文件保留，未迁移其数据。
