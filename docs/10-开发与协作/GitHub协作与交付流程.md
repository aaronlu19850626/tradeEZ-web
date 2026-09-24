---
doc_id: GITHUB-WORKFLOW
status: active
owner: integration-owner
last_verified: 2026-09-24
---

# GitHub 协作与交付流程

## Project 配置

统一项目使用字段：

- `Status`：Backlog、Research、Requirement Review、Frontend Mock、User Confirmation、Backend、Integration、Testing、PR Review、Done、Blocked。
- `Type`：Epic、Research、Feature、Bug、Docs、Test、Chore。
- `Module`、`Priority(P0/P1/P2)`、`Phase`、`Owner`、`Reviewer`、`Risk`、`Target iteration`。

建立管理总览、研究盘点、一期路线图、PR 审查、风险阻塞和人员任务六个视图。分支、worktree、端口和数据库写入 Issue 的“开发隔离”，不建立长期 Project 字段。

## 1. 创建任务

选择对应 Issue Form，填写目标、包含/不包含、验收标准、负责人、目录、共享资源和依赖。大模块创建 Epic，再拆成可独立验收的子 Issue。

## 2. 创建分支和 worktree

主工作树保持干净并同步远端：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git worktree add ../wt-<module>-<issue> -b feat/<module>-<issue> origin/main
```

文档、修复和工程分支分别使用 `docs/`、`fix/`、`chore/`。存在未提交成果时先确认归属，不得通过 `reset --hard` 或 `clean` 制造干净状态。

## 3. 准备独立环境

每个 worktree 使用独立前后端端口、`tradeez_dev_*`、`tradeez_test_*`、`tradeez_e2e_*` 数据库、临时目录和 Playwright 状态。启动前在 Issue 登记名称，不写密码或完整连接串。

## 4. 分阶段交付

按[开发规则](开发规则.md)流转状态。每个阶段把研究、确认、截图、API 契约和测试证据附到 Issue 或 PR；仓库不创建日期型过程报告。

## 5. 提交

```bash
git status --short
git diff --check
git add -- <本任务文件>
git diff --cached --check
git diff --cached --stat
git commit -m 'feat(module): describe behavior'
```

不得提交密钥、`.env`、运行数据库、认证状态、用户数据、日志和构建产物。

## 6. 同步主干

```bash
git fetch origin
git rebase origin/main
```

冲突按真实意图解决；不确定时执行 `git rebase --abort`。已推送且确认无人共写时使用 `git push --force-with-lease`，禁止 `--force` 和强推 `main`。

## 7. 创建 PR

```bash
git push -u origin HEAD
gh pr create --base main --title 'feat(module): goal' --body-file <pr-body-file>
gh pr checks <PR编号> --watch
```

PR 关联 Issue、模块规格和确认记录，说明验证结果、数据库影响、风险、回滚和未决项。页面变化附适用视口和主题证据。

## 8. 审查和合并

产品负责人核对范围和交互；技术负责人核对实现和门禁；数据库负责人核对迁移。默认 squash merge。紧急修复仍需关联事故 Issue、PR 和补充门禁。

## 9. 合并后

1. 确认 PR 状态为 `MERGED`。
2. 由部署流程同步生产测试环境和数据库迁移。
3. 更新 GitHub Project、Issue 和发布级当前状态。
4. 停止任务服务，确认 worktree 没有独有修改后移除。

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git worktree remove ../wt-<module>-<issue>
git branch -d feat/<module>-<issue>
```

## AI 分工

Codex 是本地主要编码者；GitHub Copilot 可辅助 Issue 拆分、研究、PR 总结和 CI 分析。任何时刻只能有一个编码代理写入一个分支。换模型或换人时必须按[AI 接手与会话交接](AI接手与会话交接.md)交接。
