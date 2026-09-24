# TradeEZ 贡献入口

本文件只提供仓库级入口。完整规则见 [GitHub 协作与交付流程](docs/10-开发与协作/GitHub协作与交付流程.md)。

## 开始任务

1. 阅读 `AGENTS.md`、当前状态和当前 GitHub Issue。
2. 从最新 `origin/main` 创建独立分支和 worktree。
3. 在 Issue 登记负责人、审查人、目录、端口、数据库和共享资源。
4. 只在 Issue 已授权的阶段和范围内工作。

分支命名：

```text
feat/<module>-<issue>
fix/<module>-<issue>
docs/<topic>-<issue>
chore/<topic>-<issue>
```

一个可验收任务对应一个 Issue、一个分支、一个 worktree 和一个 PR。不得直接向 `main` 提交或推送业务修改。

## 提交前

根据改动范围运行：

```bash
./scripts/quality/static.sh
./scripts/quality/e2e.sh
python3 scripts/docs/check_docs.py
git diff --check
```

页面、交互、导航、认证或数据流变化必须运行 E2E。测试必须使用独立数据库和端口。

提交信息使用 Conventional Commits，例如：

```text
feat(notebook): add note list mock
fix(accounts): reject duplicate submission
docs: consolidate collaboration workflow
```

## Pull Request

PR 必须关联 Issue，并说明范围、确认记录、测试证据、数据库影响、风险、回滚和未决项。默认通过 squash merge 合并；合并前同步最新 `origin/main`，所有必需检查和审查必须通过。
