# TradeEZ

TradeEZ 是面向交易者的交易数据同步、分析与复盘平台。系统由 Next.js 前端、FastAPI 后端、PostgreSQL 数据库和多平台连接器组成；当前可运行基线包含认证、账户、交易记录、交易总览及 MT5 数据同步能力。

## 文档入口

- 新模型和开发人员先读 [AGENTS.md](AGENTS.md)。
- 当前阶段、已验证基线和未决项见 [当前状态](docs/00-项目状态/当前状态.md)。
- 完整文档导航见 [docs/README.md](docs/README.md)。
- 开发和提交操作见 [GitHub 协作与交付流程](docs/10-开发与协作/GitHub协作与交付流程.md)。
- 模块需求以 [模块目录](docs/20-产品与研究/模块目录.md)登记的唯一规格和当前 GitHub Issue 为准。

## 技术栈

| 区域 | 技术 |
|---|---|
| 前端 | Next.js 16、React 19、TypeScript、Tailwind CSS 4、shadcn/Radix |
| 后端 | FastAPI、Python 3.12 |
| 数据 | PostgreSQL、版本化迁移 |
| 测试 | pytest、TypeScript、Biome、生产构建、Playwright |
| 协作 | GitHub Project、Issue、独立分支/worktree、PR、Actions |

## 仓库结构

```text
frontend/    Web 控制台
backend/     API、业务服务、数据访问和迁移
connectors/  MT5 及其他交易平台连接器
docs/        当前有效的长期文档
scripts/     质量门禁、发布和运维脚本
```

## 最短本地启动

后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端：

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

环境变量、数据库和并行端口必须按 [本地开发与并行环境](docs/60-运行与部署/本地开发与并行环境.md)配置。完整门禁：

```bash
./scripts/quality/check.sh
```

不得把测试命令指向共享开发库、生产测试库或生产库。
