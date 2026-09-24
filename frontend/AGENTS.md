# TradeEZ 前端代理规则

先遵守仓库根目录 `AGENTS.md`，再读取：

1. `../docs/50-前端与设计系统/前端实现规则.md`
2. `../docs/50-前端与设计系统/视觉与交互规范.md`
3. 当前模块在 `../docs/20-产品与研究/模块目录.md` 指定的规格

## Next.js 规则

- 当前项目使用 Next.js 16；编码前读取 `node_modules/next/dist/docs/` 中与任务有关的当前版本说明。
- `page.tsx` 默认保持 Server Component；交互和浏览器能力放入专用 Client Component。
- 页面专用代码放在路由 `_components/`，跨两个模块复用后才提升为共享业务组件。
- 不修改 `src/components/ui/` 和 `src/components/calendar/` 来满足单个页面需求。
- 使用现有 `@/` 别名、严格 TypeScript、Biome 双引号和两空格格式。

## 目录边界

```text
src/app/(main)/dashboard/<screen>/          页面和模块专用代码
src/app/(main)/dashboard/_components/       Dashboard 共享业务组件
src/components/                             应用级共享组件
src/components/ui/                          shadcn/Radix 基础组件
src/hooks/、src/lib/                         共享逻辑
src/styles/presets/                         主题预设
```

新页面必须覆盖加载、空、错误、禁用、成功、溢出、键盘、Light/Dark、中文/英文和 390/768/1024/1440px。页面、交互、数据流或导航变更必须运行受管 Playwright 门禁。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing code and follow current deprecation notices.

<!-- END:nextjs-agent-rules -->
