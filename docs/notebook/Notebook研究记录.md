---
doc_id: NOTEBOOK-RESEARCH
status: active
owner: product-owner
last_verified: 2026-09-25
github_issue: aaronlu19850626/tradeEZ-web#9
---

# Notebook 模块研究记录

> 关联 Issue：`aaronlu19850626/tradeEZ-web#9`
> 需求来源：产品负责人飞书文档（以该描述为准）
> 阶段：Research
> 结论分类：`用户明确要求`、`TradeEZ 自主设计`
> 说明：本文用于本地评审；图片不上传 GitHub，仅在本地关联查看。

## 1. 模块定位

Notebook 是记录不同维度笔记的模块。维度笔记包括：

1. `交易笔记`：记录每笔交易的笔记。
2. `每日日志`：记录某一天的笔记。
3. `阶段回顾`：记录某个日期范围区间的笔记。
4. `个人笔记`：自由笔记。
5. `可维护的笔记文件夹`：自定义，可增删及改名。

## 2. 全局能力

每份笔记全局支持：

- 加入收藏：放入收藏夹快捷访问。
- 删除：放入回收站。
- 多标签：可通过标签过滤查询相关笔记。
- 自动保存：打开笔记时自动保存。
- 历史版本：内容变化时生成历史版本，可查询并回撤到任意版本。
- 模板库：包含系统模板和用户自定义模板。
- 默认模板：不同维度的笔记可定义默认模板。
- 分享：分享链接可被外部非登录客户端访问。
- 查询：全局按交易账户（可多账户）、内容匹配、维度（可多选）、标签查询。

## 3. 信息架构与页面结构

- 左侧为维度文件夹目录：所有笔记、收藏夹、交易笔记、每日日志、阶段回顾、自定义文件夹、Tag、回收站。
- 无笔记时，打开主页显示空状态。
- 有笔记时，默认打开主页显示最后一次编辑的笔记。
- 文件夹行交互包含默认、鼠标悬停、加载状态。
- 文件夹操作：无操作、新增笔记、更多操作（设置默认模板等）。
- 数据未加载时，更多操作无排序；数据加载后提供排序。

## 4. 功能点覆盖矩阵

| ID | 功能点 | 用户角色 | 来源 | 优先级建议 | TradeEZ 状态 | 页面/接口 | 异常与权限 | 响应式 | 证据 |
|---|---|---|---|---|---|---|---|---|---|
| F-001 | 笔记维度与默认文件夹 | 交易者 | 用户明确要求 | P0 | 待重做 | Notebook 目录 | 空态 | 桌面/移动 | 飞书截图 |
| F-002 | 主页默认打开最后编辑笔记 | 交易者 | 用户明确要求 | P0 | 待重做 | 主页 | 空态 | 桌面/移动 | 飞书截图 |
| F-003 | 文件夹行状态与排序 | 交易者 | 用户明确要求 | P0 | 待重做 | 文件夹列表 | 加载前无排序 | 桌面/移动 | 飞书截图 |
| F-004 | 新增笔记 | 交易者 | 用户明确要求 | P0 | 待重做 | 文件夹操作 | 按维度创建 | 桌面/移动 | 飞书截图 |
| F-005 | 文件夹更多操作与默认模板 | 交易者 | 用户明确要求 | P0 | 待重做 | 文件夹菜单 | 系统/自定义差异 | 桌面/移动 | 飞书截图 |
| F-006 | 总查询（账户/内容/维度/标签） | 交易者 | 用户明确要求 | P0 | 待重做 | All notes 过滤 | 多选组合 | 桌面/移动 | 飞书截图 |
| F-007 | 所有笔记：排序/Show all/共享/Select all/Bulk | 交易者 | 用户明确要求 | P0 | 待重做 | All notes | 固定高度内滚动 | 桌面/移动 | 飞书截图 |
| F-008 | 收藏夹 | 交易者 | 用户明确要求 | P1 | 待重做 | Favorites | 无更多操作 | 桌面/移动 | 飞书截图 |
| F-009 | 交易笔记关联与编辑 | 交易者 | 用户明确要求 | P0 | 待重做 | Trade Notes | 一对一、可暂不关联、关联后标题锁定 | 桌面/移动 | 飞书截图 |
| F-010 | 每日日志 | 交易者 | 用户明确要求 | P0 | 待重做 | Daily Journal | 一天唯一、日历过滤已有日期、交易分析 | 桌面/移动 | 飞书截图 |
| F-011 | 阶段回顾 | 交易者 | 用户明确要求 | P0 | 待重做 | Review | 日期范围、标题随范围更新 | 桌面/移动 | 飞书截图 |
| F-012 | 自定义文件夹 | 交易者 | 用户明确要求 | P1 | 待重做 | 自定义目录 | 名称/图标/编辑/删除 | 桌面/移动 | 飞书截图 |
| F-013 | Tag 展示与过滤 | 交易者 | 用户明确要求 | P0 | 待重做 | Tag | 同步过滤条件 | 桌面/移动 | 飞书截图 |
| F-014 | 回收站 | 交易者 | 用户明确要求 | P0 | 待重做 | Trash | 排序/清空/预览/恢复 | 桌面/移动 | 飞书截图 |
| F-015 | 历史版本与回撤 | 交易者 | 用户明确要求 | P0 | 待重做 | 版本抽屉 | 回撤任意版本 | 桌面/移动 | 飞书截图 |
| F-016 | 笔记模板库 | 交易者 | 用户明确要求 | P0 | 待重做 | 模板管理 | 系统模板可改/删/恢复、用户模板、默认模板 | 桌面/移动 | 飞书截图 |
| F-017 | 分享外网无登录访问 | 交易者 | 用户明确要求 | P1 | 待重做 | 分享弹层 | 外部可读 | 桌面/移动 | 飞书截图 |
| F-018 | 自动保存与版本 | 交易者 | 用户明确要求 | P0 | 待重做 | 编辑器 | 内容变化生成版本 | 桌面/移动 | 飞书截图 |

## 5. 功能与交互细节

### 5.1 所有笔记

- 默认按最后更新时间排序；`Show all N` 后固定高度，模块内滚动。
- 已分享笔记在标题旁显示共享图标。
- 更多操作、`Select All`、Bulk Action 及操作提示按飞书截图实现。

### 5.2 收藏夹

- 功能同所有笔记；加载数据后无更多操作。

### 5.3 交易笔记

- 查询主逻辑同所有笔记。
- 一笔交易与一个交易笔记为一对一关系。
- 交易笔记可暂时不关联具体交易。
- 新建后默认为无标题、未关联交易。
- 点击笔记名直接修改；关联交易后标题不可修改。
- 支持撤销交易关联。
- 分享、收藏、使用模板、删除按飞书截图实现。

### 5.4 每日日志

- 创建针对某一天；一天只能有一个每日日志，不能重复创建。
- 新增时弹出日历，过滤已有每日日志的日期。
- 右侧编辑区展示交易分析，可展开。
- 点击标题可切换日期。
- 分享链接包含分析项。

### 5.5 阶段回顾

- 逻辑同每日日志，创建时选择日期范围。
- 点击标题可修改日期范围，同时把标题更新为日期范围。

### 5.6 自定义文件夹

- 添加时可定义名称和默认图标。
- 更多操作可编辑文件夹属性（名称和图标）及删除文件夹。

### 5.7 Tag

- 展示所有已定义 tag。
- 选择 tag 后在所有笔记栏同步过滤条件并查询出该 tag 的笔记。

### 5.8 回收站

- 更多操作包含排序和清空。
- 点击已删除笔记进入预览，可恢复。

### 5.9 笔记历史版本

- 预览各阶段保存的版本。
- 选择历史版本可回撤到该版本。

### 5.10 笔记模板

- 在文件夹默认模板和编辑器工具栏选择模板时使用。
- 系统推荐模板可删除和修改，并提供恢复系统推荐模板功能。
- 用户创建模板归入“我的模板”。
- 可设置/取消全局默认模板；创建笔记时优先使用所属文件夹默认模板，其次全局默认模板，否则空页面创建。
- 模板查询、创建（标题和内容必填）、添加后视图、更多操作、默认模板显示按飞书截图实现。

## 6. 数据对象草案（TradeEZ 自主设计，待评审）

| 对象 | 关键字段 |
|---|---|
| Note | `id`、`folder_id`、`note_type`（trade/daily/review/personal）、`title`、`content`、`plain_text`、`tags[]`、`favorite`、`deleted_at`、`created_at`、`updated_at`、`version_no`、`share_token`、`linked_trade_id`、`note_date/date_from/date_to`、`template_id` |
| Folder | `id`、`name`、`folder_type`（system/custom）、`icon`、`default_template_id`、`position`、`sort` |
| Tag | `id`、`name`、`note_count` |
| Template | `id`、`name`、`content`、`template_type`（system/user）、`is_default`、`deleted_at` |
| NoteVersion | `id`、`note_id`、`version_no`、`content_snapshot`、`created_at` |

> 以上字段仅用于需求评审，不直接映射数据库 schema；最终字段、关系和迁移在 Backend 阶段按 TradeEZ 规范确定。

## 7. 权限与异常路径

- 分享链接支持外部非登录访问；编辑权限、有效期和访问范围由产品负责人确认。
- 每日日志一天唯一；重复创建应拦截并提示。
- 交易笔记一对一关联；已关联交易时标题锁定，撤销关联后恢复编辑能力。
- 系统模板可改/删，但必须提供恢复系统推荐模板。
- 回收站支持恢复；清空与永久删除需确认。
- 历史版本可回撤；无版本时的空态与保留策略待确认。
- 账户过滤复用 TradeEZ 现有账户选择组件；`View trade details` 复用独立订单明细组件，不在本模块实现。

## 8. TradeEZ 自主设计清单

- 品牌视觉、Token、组件、文案与图标全部使用 TradeEZ 自有资源，不复刻飞书/TradeZella 样式。
- 账户选择复用现有组件；订单明细复用现有组件。
- 富文本编辑器复用 Lexical 通用组件，使用前重新确认接口与节点范围。
- API、权限、分页、排序、标签、模板和迁移按 TradeEZ 自有契约与 PostgreSQL 设计。
- 回收站与历史版本保留时长未在需求中明确，需产品负责人确认。
- 分享链接的可编辑性、有效期、密码保护等需产品负责人确认。
- P0/P1/P2 仅为研究建议，最终由产品负责人确认。

## 9. 验收要点

- 空态与默认打开最后编辑笔记。
- 文件夹默认/悬停/加载状态，数据加载前无排序。
- 总查询的账户多选、内容匹配、维度多选、标签多选组合。
- 所有笔记排序、`Show all`、共享图标、`Select All`、Bulk Action。
- 交易笔记关联/撤销关联/标题锁定；每日日志一天唯一与日历过滤；阶段回顾日期范围。
- 自定义文件夹增删改与默认图标；Tag 展示与联动过滤。
- 回收站排序/清空/预览/恢复；历史版本预览/回撤。
- 模板查询/创建必填/系统模板恢复/全局默认模板回退规则。
- 分享链接无登录访问；自动保存与版本生成。
- 390/768/1024/1440 视口及 Light/Dark 主题，内部滚动不遮内容。

## 10. 截图证据

完整需求截图：

<img src="assets/feishu/fullpage.png" alt="飞书完整文档">

分屏截图（按飞书文档出现顺序）：

<img src="assets/feishu/feishu-img-01.png" alt="截图 01">
<img src="assets/feishu/feishu-img-02.png" alt="截图 02">
<img src="assets/feishu/feishu-img-03.png" alt="截图 03">
<img src="assets/feishu/feishu-img-04.png" alt="截图 04">
<img src="assets/feishu/feishu-img-05.png" alt="截图 05">
<img src="assets/feishu/feishu-img-06.png" alt="截图 06">
<img src="assets/feishu/feishu-img-07.png" alt="截图 07">
<img src="assets/feishu/feishu-img-08.png" alt="截图 08">
<img src="assets/feishu/feishu-img-09.png" alt="截图 09">
<img src="assets/feishu/feishu-img-10.png" alt="截图 10">
<img src="assets/feishu/feishu-img-11.png" alt="截图 11">
<img src="assets/feishu/feishu-img-12.png" alt="截图 12">
<img src="assets/feishu/feishu-img-13.png" alt="截图 13">
<img src="assets/feishu/feishu-img-14.png" alt="截图 14">
<img src="assets/feishu/feishu-img-15.png" alt="截图 15">
<img src="assets/feishu/feishu-img-16.png" alt="截图 16">
<img src="assets/feishu/feishu-img-17.png" alt="截图 17">
<img src="assets/feishu/feishu-img-18.png" alt="截图 18">
<img src="assets/feishu/feishu-img-19.png" alt="截图 19">
<img src="assets/feishu/feishu-img-20.png" alt="截图 20">
<img src="assets/feishu/feishu-img-21.png" alt="截图 21">
<img src="assets/feishu/feishu-img-22.png" alt="截图 22">
<img src="assets/feishu/feishu-img-23.png" alt="截图 23">
<img src="assets/feishu/feishu-img-24.png" alt="截图 24">
<img src="assets/feishu/feishu-img-25.png" alt="截图 25">
<img src="assets/feishu/feishu-img-26.png" alt="截图 26">
<img src="assets/feishu/feishu-img-27.png" alt="截图 27">
<img src="assets/feishu/feishu-img-28.png" alt="截图 28">
<img src="assets/feishu/feishu-img-29.png" alt="截图 29">
<img src="assets/feishu/feishu-img-30.png" alt="截图 30">
<img src="assets/feishu/feishu-img-31.png" alt="截图 31">
<img src="assets/feishu/feishu-img-32.png" alt="截图 32">
<img src="assets/feishu/feishu-img-33.png" alt="截图 33">
<img src="assets/feishu/feishu-img-34.png" alt="截图 34">
<img src="assets/feishu/feishu-img-35.png" alt="截图 35">
<img src="assets/feishu/feishu-img-36.png" alt="截图 36">
<img src="assets/feishu/feishu-img-37.png" alt="截图 37">
<img src="assets/feishu/feishu-img-38.png" alt="截图 38">
<img src="assets/feishu/feishu-img-39.png" alt="截图 39">
<img src="assets/feishu/feishu-img-40.png" alt="截图 40">
<img src="assets/feishu/feishu-img-41.png" alt="截图 41">
<img src="assets/feishu/feishu-img-42.png" alt="截图 42">
<img src="assets/feishu/feishu-img-43.png" alt="截图 43">
<img src="assets/feishu/feishu-img-44.png" alt="截图 44">
<img src="assets/feishu/feishu-img-45.png" alt="截图 45">
<img src="assets/feishu/feishu-img-46.png" alt="截图 46">
<img src="assets/feishu/feishu-img-47.png" alt="截图 47">
<img src="assets/feishu/feishu-img-48.png" alt="截图 48">
<img src="assets/feishu/feishu-img-49.png" alt="截图 49">
<img src="assets/feishu/feishu-img-50.png" alt="截图 50">
<img src="assets/feishu/feishu-img-51.png" alt="截图 51">
<img src="assets/feishu/feishu-img-52.png" alt="截图 52">
<img src="assets/feishu/feishu-img-53.png" alt="截图 53">
<img src="assets/feishu/feishu-img-54.png" alt="截图 54">
<img src="assets/feishu/feishu-img-55.png" alt="截图 55">
<img src="assets/feishu/feishu-img-56.png" alt="截图 56">

> 旧 TradeZella 研究截图已归档到 `docs/notebook/assets/tradezella/`，不再作为当前需求依据。
