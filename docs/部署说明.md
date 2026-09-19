# TradeSync 部署手册

版本 v1.0 · 2026-07-21 · 代码托管 GitHub · 自建海外服务器

---

## 0. 前置信息（部署时需要用户提供）

- [ ] 远程服务器 SSH 登录信息（IP、用户、密钥/密码、端口）
- [ ] 域名（如 `api.yourdomain.com`、`app.yourdomain.com`）及 DNS 管理权限
- [ ] GitHub 仓库（新建 private repo）
- [ ] 服务器规格（建议 ≥ 2C4G，Ubuntu 22.04 LTS）
- [ ] 邮件服务凭据（注册验证/找回密码，如 SES/SMTP）
- [ ] 支付服务凭据（Stripe，海外）——可 P3 再接

> 安全：SSH 凭据、API 密钥等机密不写进仓库，只放服务器 `.env`（chmod 600），
> 仓库提交 `.env.example` 占位。私钥类文件永不入库。

---

## 1. GitHub 托管

```bash
# 本地
cd TradeSync-Web
git init
git add .
git commit -m "init: TradeSync scaffold + docs"
git branch -M main
git remote add origin git@github.com:<you>/tradesync-web.git
git push -u origin main
```

**分支策略**：`main`(生产) ← `develop`(集成) ← `feat/*`(功能)。
**.gitignore**：`.env`, `.venv/`, `node_modules/`, `__pycache__/`, `*.pyc`, `.next/`, `dist/`。

---

## 2. 部署架构（Docker Compose）

```
[Internet] → [Nginx :443 TLS] ┬→ frontend (Next.js :3000)
                              └→ backend  (FastAPI :8000) → postgres :5432
                                                          → redis  (Celery broker)
                              worker (celery/apscheduler)  ┘
```

`docker-compose.yml` 服务：`nginx` · `frontend` · `backend` · `worker` · `postgres` · `redis`。

---

## 3. 服务器初始化（Ubuntu 22.04）

```bash
# 系统更新 + Docker
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # 重登生效
sudo apt -y install docker-compose-plugin

# 防火墙:仅开 22/80/443
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443
sudo ufw enable

# 拉代码
git clone git@github.com:<you>/tradesync-web.git
cd tradesync-web
cp .env.example .env               # 填真实密钥,chmod 600 .env
```

---

## 4. 环境变量（.env.example）

```env
# 数据库
POSTGRES_USER=tradesync
POSTGRES_PASSWORD=<强密码>
POSTGRES_DB=tradesync
DATABASE_URL=postgresql+asyncpg://tradesync:<pw>@postgres:5432/tradesync

# 应用
JWT_SECRET=<随机64位>
HMAC_ENFORCE=true
CORS_ORIGINS=https://app.yourdomain.com

# Redis / Celery
REDIS_URL=redis://redis:6379/0

# AI
ANTHROPIC_API_KEY=<key>

# 邮件
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...

# 域名
API_DOMAIN=api.yourdomain.com
APP_DOMAIN=app.yourdomain.com
```

---

## 5. TLS 证书（Let's Encrypt）

```bash
# 用 certbot 或 nginx-proxy + acme-companion
sudo apt -y install certbot
sudo certbot certonly --standalone -d api.yourdomain.com -d app.yourdomain.com
# 证书挂载进 nginx 容器;配置自动续期 (certbot renew --deploy-hook)
```

DNS：`api` 和 `app` 两条 A 记录指向服务器 IP。

---

## 6. 启动与迁移

```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head   # 建表
docker compose logs -f backend                     # 观察
```

健康检查：`GET https://api.yourdomain.com/health` 返回 200。

---

## 7. CI/CD（GitHub Actions，可选）

`.github/workflows/deploy.yml`：push 到 `main` → SSH 到服务器 → `git pull` +
`docker compose up -d --build` + `alembic upgrade head`。
SSH 私钥、服务器 IP 放 GitHub Actions Secrets，不入库。

---

## 8. 备份与监控

- **备份**：`pg_dump` 每日定时，异地存储（用户资产级数据，务必做）。
  ```
  docker compose exec postgres pg_dump -U tradesync tradesync | gzip > backup_$(date +%F).sql.gz
  ```
- **监控**：容器健康、磁盘、API 错误率、同步接口 QPS；可接 Uptime Kuma / Grafana。
- **日志**：结构化日志 + 保留策略；审计敏感操作（Key 生成/吊销）。

---

## 9. MT5 EA 联网配置（写进用户手册）

用户在 MT5：**工具 → 选项 → EA 交易 → 允许 WebRequest 到以下 URL** →
加入 `https://api.yourdomain.com`。否则 EA 联网被拒。

---

## 10. 部署顺序清单

1. [ ] 服务器初始化 + Docker + 防火墙
2. [ ] DNS 解析 + TLS 证书
3. [ ] clone 仓库 + 填 .env
4. [ ] `docker compose up` + `alembic upgrade head`
5. [ ] 健康检查 + 冒烟测试（注册→绑定→EA 推一条成交→查询能看到）
6. [ ] 备份定时 + 监控
7. [ ] CI/CD（可选）

> 部署由 Claude 执行；用户提供服务器 SSH 与域名后开始。
> 高风险操作（防火墙、证书、数据库迁移）逐步确认。
