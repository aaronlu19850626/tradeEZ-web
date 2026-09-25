---
doc_id: NOTEBOOK-SPEC
status: needs-review
owner: product-owner
last_verified: 2026-09-25
github_issue: aaronlu19850626/tradeEZ-web#9
---

# Notebook

## 基本信息

- 模块 ID：`notebook`
- 状态：`needs-review`
- GitHub Epic/Issue：[#4](https://github.com/aaronlu19850626/tradeEZ-web/issues/4) / [#9](https://github.com/aaronlu19850626/tradeEZ-web/issues/9)
- 维护人：待指派
- 代码入口：待 Frontend Mock 确认后登记
- 依赖模块：账户管理（账户选择组件）、交易记录（交易笔记关联）、订单明细（复用跳转）
- 串行资源：全局导航、共享 Token、数据库迁移（进入 Backend 前登记）

## 目标与边界

### 包含

- 维度笔记：交易笔记、每日日志、阶段回顾、个人笔记。
- 自定义文件夹：新增、删除、改名、默认图标。
- 笔记全局操作：收藏、删除、多标签、自动保存、历史版本、模板、分享、查询。
- 查询：全局按交易账户多选、内容匹配、维度多选、标签过滤。
- 回收站：排序、清空、预览、恢复。
- 历史版本：预览与回撤。
- 模板：系统模板与用户模板、默认模板、恢复系统推荐模板。

### 不包含

- 订单明细页面：复用现有独立组件，仅保留 `trade_id` 关联与跳转。
- 账户选择组件：复用现有组件。
- 分享链接的可编辑权限、有效期、密码保护：待产品负责人确认。
- AI 写作、语音输入、导入/导出、全宽/工具栏切换等未确认能力。

## 功能点矩阵

见独立矩阵：[Notebook 功能覆盖矩阵](../notebook/功能覆盖矩阵.md)。

## 用户流程和状态

- 主页：无笔记显示空态；有笔记默认打开最后编辑的笔记。
- 新建：按维度创建；每日日志按日期、阶段回顾按日期范围、交易笔记可暂不关联交易。
- 编辑：标题与正文自动保存；内容变化生成历史版本。
- 查询：账户多选、内容匹配、维度多选、标签多选组合过滤。
- 文件夹：默认/悬停/加载状态；加载后提供排序；自定义文件夹支持增删改与默认图标。
- 回收站：排序、清空、预览、恢复。
- 模板：查询、创建、修改、删除、设置默认模板、恢复系统推荐模板。
- 分享：外部非登录客户端可访问。
- 异常：每日日志一天唯一；关联交易后交易笔记标题锁定；模板标题与内容必填。

## 数据与接口

数据对象草案：

| 对象 | 关键字段 |
|---|---|
| Note | `id`、`folder_id`、`note_type`、`title`、`content`、`plain_text`、`tags[]`、`favorite`、`deleted_at`、`created_at`、`updated_at`、`version_no`、`share_token`、`linked_trade_id`、`note_date/date_from/date_to`、`template_id` |
| Folder | `id`、`name`、`folder_type`、`icon`、`default_template_id`、`position`、`sort` |
| Tag | `id`、`name`、`note_count` |
| Template | `id`、`name`、`content`、`template_type`、`is_default`、`deleted_at` |
| NoteVersion | `id`、`note_id`、`version_no`、`content_snapshot`、`created_at` |

API 契约、权限模型、分页、排序和迁移在 Backend 阶段按 TradeEZ 自有规范设计，不直接照搬参考产品字段与端点。

## 验收标准

- [ ] 产品负责人确认范围与优先级
- [ ] 前端 Mock 确认
- [ ] API/迁移契约确认
- [ ] 后端和前端测试
- [ ] Playwright 证据
- [ ] PR 审查和回滚点

## 未决项与变更记录

- 回收站与历史版本保留时长待确认。
- 公开分享的访问范围与权限待确认。
- 一期是否包含 AI 写作、语音输入、导入/导出待确认。
- 动态讨论保存在 GitHub Issue，本节只保留稳定决策。
