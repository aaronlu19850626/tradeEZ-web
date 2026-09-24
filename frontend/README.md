# TradeEZ 前端

Next.js 16、React 19、TypeScript、Tailwind CSS 4 和 shadcn/Radix 控制台。

开始前阅读根目录 `AGENTS.md`、当前 Issue、[前端实现规则](../docs/50-前端与设计系统/前端实现规则.md)和[视觉与交互规范](../docs/50-前端与设计系统/视觉与交互规范.md)。

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

常用检查：

```bash
npx tsc --noEmit
npx biome check --diagnostic-level=error --max-diagnostics=300
npm run build -- --webpack
```

页面和交互变化还必须从仓库根目录运行 `./scripts/quality/e2e.sh`。不得使用共享数据库或其他任务的端口、浏览器认证状态和报告目录。
