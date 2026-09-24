---
doc_id: AI-HANDOFF
status: active
owner: integration-owner
last_verified: 2026-09-24
---

# AI 接手与会话交接

## 接手时读取

1. 根 `AGENTS.md`。
2. [当前状态](../00-项目状态/当前状态.md)。
3. 当前 GitHub Issue、Epic、PR 和 Project 状态。
4. 当前模块唯一规格。
5. 与任务相关的专项规范。

## 接手时核查

```bash
git rev-parse --show-toplevel
git status --short --branch
git branch -vv
git worktree list
git log --oneline --decorate -8
```

同时核对运行端口、数据库名称、服务健康、未提交修改和最近 CI。不要输出密码、Token 或完整数据库 URL。

## 首条工作报告模板

```text
仓库根目录：
当前分支和 HEAD：
工作树状态：
关联 Issue/PR：
当前阶段：
已读取文档：
允许修改目录：
共享/串行资源：
本任务端口和数据库名称：
已确认事实：
仍需确认事项：
下一项具体动作：
```

若没有当前 Issue，不得自行选择业务模块编码；可以盘点代码、验证运行状态或协助创建研究/规划 Issue。

## 交出任务前

- 提交或明确列出所有未提交修改，不留下来源不明的工作树。
- 在 Issue 写明完成内容、验证命令、失败/跳过项、风险、阻塞和下一步。
- 记录分支、HEAD、worktree、端口和数据库名称，不记录秘密。
- 更新模块规格中的稳定事实；动态进度只写 GitHub。
- 如果有 PR，确保正文和检查结果与实际一致。

## 事实冲突处理

按“代码/schema/测试 → GitHub → 已确认模块规格 → 当前状态 → Git 历史”排序核查。不得为了匹配文档而覆盖较新的代码事实；应建立修正文档或实现的 Issue。
