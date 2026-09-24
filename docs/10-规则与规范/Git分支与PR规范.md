# Git 分支与 PR 规范

版本：2.0；状态：已生效；用途：管理需求、并行分支、审查和安全集成；维护人：集成负责人；依赖：《多人协作开发规范》《新工作启动操作手册》；验收入口：Issue/PR、CI、审查记录和 main 提交。

## 1. 基线与边界

GitHub main 是合并代码事实源，主干保持可构建、可测试。日常变更不得直接提交/推送 main，走 Issue → 分支/worktree → PR → 门禁 → 审查 → 合并。

本轮用户明确授权：此前未提交的现有代码必须保留并进入 main，不能拿旧主干覆盖。这是一次基线整理例外，不是今后绕过 PR 的许可。基线记录须区分本地提交、远端推送、CI 和验收是否实际完成。

建议 GitHub 设置 main 需要 PR、必需 CI 和独立审查，禁止强制推送与删除。设置是否已经启用必须实际核查；没有权限配置时记录缺口，仍人工执行相同流程。

## 2. 命名和创建

分支采用 `feat/<module>-<issue>`、`fix/<module>-<issue>`、`docs/<topic>`、`chore/<topic>`。一个可验收任务一个分支/worktree/PR；大模块用父 Issue 和有依赖的子 Issue 拆分。

```bash
git status --short --branch
git fetch origin
git worktree add ../wt-example-123 -b feat/example-123 origin/main
```

存在未提交改动时先确认归属，保留原 worktree；禁止 reset/clean 去制造“干净”。一个分支只由一个主要任务写入，依赖变更另开共享 PR 先合并。

## 3. 提交与同步

提交只包含任务相关文件，检查暂存差异和敏感信息。提交信息用 `feat(module): 行为`、`fix(module): 问题`、`docs: 规范`、`chore: 工程变更`。不得提交 .env、密钥、数据库、运行数据、认证文件、生成报告和构建缓存。

前端只使用 npm / package-lock.json；新增依赖先登记串行资源，安装不能混用 pnpm。数据库迁移由集成负责人在最新 main 单链上串行分配 revision，不采用模块固定号段。

```bash
git diff --check
git add -- <本任务文件>
git diff --cached --check
git diff --cached --stat
git commit -m 'feat(example): <行为>'
git fetch origin
git rebase origin/main
```

冲突按真实意图解决；共享文件邀请相应负责人复核。不确定时 `git rebase --abort`，不得机械丢弃对方改动。rebase 改变已推送分支时先确认无人共写，再用 `git push --force-with-lease`；禁止 `--force` 和强推 main。

## 4. PR 内容与门禁

PR 正文使用仓库模板，并包含：关联 Issue、目标/边界、模块设计/功能矩阵、研究证据、需求和 Mock 确认记录、当前实现、测试命令/提交/结果、兼容性、风险、回滚与未决项。`Closes #编号` 仅在整个 Issue 验收确实完成时填写，研究或 Mock 阶段 PR 用 `Refs #编号`，避免提前关闭。

- `scripts/quality/static.sh`：后端 pytest、TypeScript、Biome、生产构建和 diff 检查。
- `scripts/quality/e2e.sh`：受管隔离浏览器回归；页面变化须有适用的视口、主题、状态和截图证据。
- 所有测试使用独立 test/e2e 数据库；命令未执行、环境阻塞或用例跳过必须如实列明。
- 迁移 PR 附单链 revision、隔离库新建/升级结果、是否可逆和恢复策略。
- 文件覆盖权限和 CODEOWNERS 审查不能替代产品范围/Mock 确认；技术审查也不能宣称产品已验收。

```bash
git push -u origin HEAD
cp .github/pull_request_template.md /tmp/tradeez-pr.md
# 编辑正文，核对确认记录和实际测试结果后创建。
gh pr create --base main --title 'feat(example): <目标>' --body-file /tmp/tradeez-pr.md
gh pr checks <PR编号> --watch
```

发布须在任务授权内执行，未授权时先把差异和 PR 正文准备完整。不能为获得全绿随意取消必需检查；发现旧主干问题应记录独立修复或由集成负责人纳入基线修复。

## 5. 合并与清理

产品验收点、技术审查、必需 CI 均满足后由集成负责人在 GitHub 合并，默认 squash merge。合并前重新同步最新 origin/main；若有冲突或迁移/共享契约变化，解决后重跑受影响门禁。

```bash
gh pr view <PR编号> --json state,mergeCommit,url
# 只在 state 为 MERGED 后同步本地；主工作树必须干净。
git fetch origin
git switch main
git pull --ff-only origin main
```

更新 Issue、项目进度和模块文档的真实状态。停止任务服务，确认 worktree 无未提交成果后移除；不要强制移除 worktree。远端分支可在 GitHub 合并时删除；本地 squash 分支删除受阻时先核对 PR 和独有提交，不默认执行强制删除。

## 6. 回滚和审计

已发布 main 的回滚走新的 revert PR，保留审计历史；不重写 main。数据库恢复和代码回滚分开评估，不能假定回滚代码会自动撤销迁移。紧急修复也要关联事故/问题记录和补齐门禁证据，任何临时例外写清授权、范围与后续修复。
