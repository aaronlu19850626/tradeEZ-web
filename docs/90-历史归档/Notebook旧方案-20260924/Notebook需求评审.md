# Notebook 模块需求评审

版本：1.0；状态：待评审；研究来源：TradeZella Notebook 实际页面、编辑器菜单和帮助文档。

本文必须与《前端开发强制规则》和《开发方法论》中的研究浏览器门禁一起执行。后续 Notebook 每实现一个具体功能点，都必须先打开 TradeZella 的对应页面或状态，研究实际 UI 和交互，再映射到 TradeEZ 的视觉规范。参考产品没有实现或无法观察时继续按 TradeEZ UI 规范实现，但必须登记到《前端自主设计清单》供用户评审。

## 1. 模块定位

Notebook 是交易者的个人知识空间，负责保存：

- 一般笔记
- 交易笔记
- 每日交易日志
- 笔记模板
- 笔记标签
- 收藏内容
- 学习、计划和复盘资料

Notebook 不与交易事实混存。交易事实、交易评价和订单明细仍然属于交易域，Notebook 只负责主观记录与知识沉淀。

## 2. TradeZella 现状盘点

### 2.1 左侧导航

实际观察到的入口：

- All notes
- Favorites
- Trade Notes
- Daily Journal
- Sessions Recap
- My notes
- Add folder
- Tags
- Trash

每个入口显示笔记数量。账户筛选位于页面右上角。

### 2.2 笔记列表

- 支持搜索。
- 支持按文件夹和标签筛选。
- 显示标题、相对更新时间或日期。
- 交易笔记额外显示品种、交易日期和净盈亏。
- 支持 Show all 分页或展开更多。
- 当前选中笔记有明确高亮。

### 2.3 笔记级操作

- 收藏
- Share
- Full width
- Show toolbar
- Templates
- Manage Templates
- Import
- Export
- Delete
- Version history
- 自动保存和 Saved 状态

### 2.4 编辑器

文档格式：

- Normal
- Heading 1-3
- Toggle Heading 1-3
- Bullet list
- Numbered list
- Check list
- Timed list
- Quote
- Code block

文本格式：

- Bold
- Italic
- Strikethrough
- Underline
- Inline code
- Link
- Clear formatting
- Text color
- Background color

布局：

- Left / Center / Right / Justify
- Start / End
- Outdent / Indent
- 字体族
- 字号

高级节点：

- Horizontal rule
- Page break
- Image
- Inline image
- Table
- Columns layout
- Equation
- Toggle
- Collapsible container
- X/Twitter embed
- YouTube embed

编辑能力：

- Slash 命令
- 模板
- 标签
- 语音转文字
- AI 写作
- 撤销 / 重做
- 全屏
- 版本历史

### 2.5 交易笔记

- Trade Notes 是独立系统文件夹。
- 列表显示 `品种: 日期`、更新时间和净盈亏。
- 笔记打开后继续使用通用 Markdown 编辑器。
- 交易笔记和普通笔记在内容编辑上共用同一套能力。

### 2.6 每日交易日志

- Daily Journal 是独立系统文件夹。
- 按交易日组织。
- 笔记顶部展示当日交易统计：
  - Net P&L
  - View trade details
  - Cfds traded
  - Volume
  - Commissions
  - Net ROI
  - Gross P&L
- 正文由模板驱动，例如盘前计划、盘中记录、错误、做得好和总体复盘。

### 2.7 Sessions Recap

- 属于回测会话回顾。
- 依赖独立回测模块。
- 不属于 Notebook 一期核心能力。

## 3. 需求优先级

### P0：一期必须完成

1. `/dashboard/notebook` 页面。
2. 账户范围筛选。
3. 左侧文件夹和系统入口。
4. All notes 汇总视图。
5. 自定义文件夹：新增、重命名、删除。
6. 笔记列表：标题、摘要、更新时间、选中状态和按需加载。
7. 新建一般笔记。
8. Markdown 可视化编辑器基础能力：
   - 标题
   - 粗体、斜体、下划线
   - 列表和待办
   - 引用
   - 代码
   - 链接
   - 表格
   - 图片
   - 分割线
   - 撤销和重做
   - 全屏
9. 自动保存和保存失败提示。
10. 笔记模板：
    - 应用模板
    - 文件夹默认模板
    - 基础模板管理
11. 笔记标签：
    - 搜索标签
    - 创建标签
    - 添加和移除标签
12. Favorites。
13. 搜索笔记。
14. 按文件夹和标签筛选。
15. Trade Notes：
    - 一笔交易最多一条交易笔记
    - 从交易记录或交易详情关联
    - 列表显示品种、日期和净盈亏
16. Daily Journal：
    - 复用 `daily_reviews`
    - 显示当日交易统计
    - 支持交易详情跳转
17. Trash：
    - 软删除
    - 恢复
    - 30 天保留
18. Import / Export 基础能力：
    - 导入 Markdown
    - 导出 Markdown
19. 历史版本：
    - 查看历史快照
    - 查看更新时间
    - 对比版本差异
    - 恢复历史版本
    - 自动保存和版本快照分离
20. 响应式：
    - 桌面三栏
    - 平板两栏
    - 移动端单栏

### P1：一期后增强

1. PDF 导出。
2. 文件夹排序。
3. 笔记批量选择和批量操作。
4. 更完整的模板推荐和管理。
5. 笔记内交易卡片。
6. 笔记编辑冲突处理和合并界面。

### P2：后续或独立模块

1. Share 链接。
2. AI 写作和 AI 摘要。
3. 语音转文字。
4. 多人协作和评论。
5. Columns layout。
6. Equation。
7. Page break。
8. Timed list。
9. Collapsible container。
10. X/Twitter 和 YouTube embed。
11. Sessions Recap。

## 4. 专业评审建议

### 4.1 不追求完整复制 TradeZella

TradeZella 的编辑器包含大量文档排版和嵌入能力，部分功能已经接近 Notion，而不是交易复盘的核心能力。

建议一期只保留：

```text
Markdown 语义
+ 交易关联
+ 日复盘统计
+ 模板和标签
+ 自动保存
```

暂不实现字体族、字号、文字颜色、背景色、分栏、公式和第三方嵌入。

### 4.2 内容模型坚持 Markdown

每篇笔记保存：

```text
content_markdown
content_text
content_format
revision
```

- `content_markdown`：编辑器内容。
- `content_text`：纯文本索引和搜索。
- `content_format`：一期固定为 `markdown`。
- `revision`：并发保存检测。

无论最终选择哪种编辑器，都应明确主内容格式。Markdown-first 方案不应再把编辑器内容转换成 HTML 作为主存储；块编辑器方案则需要明确 JSON 与 Markdown 导出之间的关系。

### 4.3 Trade Notes 必须一对一

建议约束：

```text
一笔交易最多一条 Trade Note
一条 Trade Note 只能关联一笔交易
```

交易重同步后使用稳定交易引用恢复关联。

### 4.4 Daily Journal 不能建立平行内容

用户已经确认日复盘继续复用 `daily_reviews`。

TradeZella 的 Daily Journal 本质上包含：

```text
交易日
+ 当日已实现统计
+ 交易详情入口
+ Markdown 复盘笔记
```

TradeEZ 应将现有 `daily_reviews` 扩展为 Notebook 的 Daily Journal 数据源，而不是创建 `daily_notes` 和 `daily_reviews` 两套内容。

### 4.5 笔记标签与交易标签分离

TradeZella 也明确说明笔记标签和交易标签不同步。

建议：

- Notebook 使用独立的 `note_tags` 和 `note_tag_links`。
- 交易标签继续属于交易复盘域。
- 不做自动同步，避免分类污染。

### 4.6 编辑体验和业务控件分层

编辑器内部使用最终选中组件的复合工具栏，但外层仍遵守项目规范：

- Dialog、Button、Input、Badge、Tooltip 使用项目全局组件。
- 图片上传走统一附件服务。
- 不直接修改 `node_modules`。
- 编辑器主题通过 CSS 变量映射项目 Token。

### 4.7 自动保存和版本历史分开

不建议每次自动保存都生成历史版本，否则会产生大量无意义快照。

建议策略：

- 输入停顿后自动保存当前草稿。
- 每 5 分钟、离开页面或用户手动保存时创建版本快照。
- 版本历史只保留有限数量或按保留策略清理。

### 4.8 搜索和分页必须在服务端

笔记数量可能增长到数千条。

建议：

- 搜索、筛选和分页下沉到后端。
- `content_text` 支持关键词搜索。
- 文件夹和标签计数由服务端聚合。
- 不把所有笔记加载到浏览器后过滤。

### 4.9 分享一期暂缓

TradeZella Share 会创建“任何持有 URL 都可读”的链接。

由于涉及交易金额、账户信息和复盘隐私，建议：

- 一期不做公开分享。
- 后续必须支持撤销、有效期和字段脱敏后再实现。

### 4.10 Session Recap 后置

Session Recap 依赖回测模块和回测结果。

在回测模块未完成前，Notebook 不应先实现会话回顾入口。

## 5. 数据模型建议

```text
notebook_folders
- id
- user_id
- name
- system_kind
- sort_order
- default_template_id
- status

notebook_notes
- id
- user_id
- folder_id
- title
- content_markdown
- content_text
- revision
- status
- created_at
- updated_at
- deleted_at

trade_notes
- id
- user_id
- trade_ref
- content_markdown
- content_text
- revision
- created_at
- updated_at

note_templates
- id
- user_id
- name
- description
- note_kind
- content_markdown
- is_default
- status

note_tags
- id
- user_id
- name

note_tag_links
- note_type
- note_id
- tag_id

note_versions
- id
- note_type
- note_id
- revision
- content_markdown
- created_at

note_favorites
- user_id
- note_type
- note_id
```

Daily Journal 不新增正文表，继续关联 `daily_reviews`。

## 6. 页面结构建议

### 桌面

```text
左侧：文件夹和系统入口
中间：笔记列表
右侧：Markdown 编辑器
```

### 平板

```text
左侧可折叠
+ 列表和编辑器
```

### 移动

```text
文件夹页
  -> 列表页
  -> 编辑器页
```

## 7. 验收标准

- 可以从交易记录打开对应 Trade Note。
- 一笔交易最多一条交易笔记。
- Daily Journal 和日复盘读取同一实体。
- 编辑停止后自动保存，显示保存状态。
- 编辑冲突不会静默覆盖。
- 文件夹、模板、标签和收藏行为正确。
- 删除笔记进入回收站并可在 30 天内恢复。
- 搜索和筛选由服务端返回稳定结果。
- Markdown、表格和图片在刷新后保持不变。
- Notebook 和 Strategy Notes 使用同一编辑器组件。
