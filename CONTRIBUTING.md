# TradeEZ 贡献指南

版本：1.0；状态：已生效；用途：为开发者和 AI 提供仓库级贡献入口；维护人：集成负责人；依赖：`AGENTS.md`、新工作启动操作手册、Git 分支与 PR 规范；验收入口：通过质量门禁并合并的 PR。

开始工作前依次阅读：

1. [`AGENTS.md`](AGENTS.md)
2. [当前接手快照](docs/00-项目总览/当前接手快照.md)
3. [新工作启动操作手册](docs/00-项目总览/新工作启动操作手册.md)
4. [Git 分支与 PR 规范](docs/10-规则与规范/Git分支与PR规范.md)
5. [多人协作开发规范](docs/00-项目总览/多人协作开发规范.md)

所有新工作从 GitHub Issue 和模块卡片开始。一个交付单元使用一个分支、一个 worktree、一个任务和一个 PR；业务开发不得直接修改 `main`。前端统一使用 npm。测试必须使用独立的 `tradeez_test_*` 和 `tradeez_e2e_*` 数据库。

合并前按改动范围运行：

```bash
./scripts/quality/static.sh
./scripts/quality/e2e.sh
git diff --check
```

需求范围与前端 Mock 由产品负责人确认；实现、测试和合并门禁由技术负责人核对。PR 必须关联 Issue，并提供确认记录、测试结果、风险和回滚点。完整操作和 AI 沟通模板以《新工作启动操作手册》为准。
