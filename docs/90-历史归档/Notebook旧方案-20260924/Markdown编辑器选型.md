# 富文本编辑器选型与 Lexical 实现

版本：2.0；状态：已选定 Lexical，Notebook 已接入并完成编辑器专项回归。

## 1. 结论

Notebook 一期编辑器采用 **Lexical**，许可为 MIT。

Lexical 负责：

- 编辑状态与节点模型。
- Markdown / JSON 序列化。
- 工具栏与划词快捷操作。
- `/` 命令菜单。
- 表格、代码块、待办、引用和分割线。
- 图片节点、缩放、裁剪和对齐。
- 后续 AI、语音输入、版本历史和自定义节点扩展。

旧 Tiptap 实现及其依赖已从代码和依赖清单中移除，不再作为候选或并行实现保留。

## 2. 选型依据

| 项目 | 结论 |
|---|---|
| Lexical | 采用。底层能力完整，节点扩展可控，适合图片、表格和自定义块的长期维护 |
| Tiptap | 不采用。曾完成原型，但最终替换为 Lexical，旧实现已删除 |
| Plate | 不采用。实现较重，与当前定制编辑器边界不匹配 |
| BlockNote | 不采用。主模型偏块 JSON，Markdown 不是第一存储格式 |
| MDXEditor | 不采用。Markdown 能力优先，但图片、表格和自定义交互扩展不足 |
| Milkdown / Novel | 不采用。维护成本或维护活跃度不符合一期要求 |

## 3. 当前代码结构

共享编辑器代码位于：

```text
frontend/src/components/editor/
├── lexical-editor.tsx
├── lexical-editor-client.tsx
├── lexical-editor.css
├── lexical-toolbar-controls.tsx
├── lexical-toolbar-controls.css
├── lexical-toolbar-icons.css
├── lexical-toolbar-localizer.tsx
├── lexical-toolbar-tooltip.tsx
├── lexical-floating-toolbar.tsx
├── lexical-insert-dropdown.tsx
├── lexical-slash-command-menu.tsx
├── lexical-slash-command-menu.css
├── lexical-tradezella-icons.tsx
└── lexical-tradezella-nodes.tsx
```

职责：

| 文件 | 职责 |
|---|---|
| `lexical-editor.tsx` | 客户端动态加载入口，避免 SSR 初始化编辑器 |
| `lexical-editor-client.tsx` | Lexical 组合、工具栏字段、标签条、扩展注册和页面接口 |
| `lexical-toolbar-controls.tsx` | 文本样式、字号、颜色、对齐、插入和撤销重做等标准控件 |
| `lexical-toolbar-localizer.tsx` | Lexical 内部按钮、菜单和提示的中英文映射 |
| `lexical-floating-toolbar.tsx` | 划词快捷工具栏 |
| `lexical-insert-dropdown.tsx` | 表格、图片、分栏、公式、YouTube、Tweet 等插入流程 |
| `lexical-slash-command-menu.tsx` | `/` 命令菜单和插入命令分发 |
| `lexical-tradezella-nodes.tsx` | 图片、Toggle、时间轴等自定义节点和图片编辑交互 |
| `lexical-tradezella-icons.tsx` | 编辑器专用图标 |

Notebook 页面适配层：

```text
frontend/src/app/(main)/dashboard/notebook/_components/
├── notebook-page.tsx
└── notebook-editor.tsx
```

`notebook-page.tsx` 负责页面、文件夹、笔记列表、模板、历史版本和回收站；`notebook-editor.tsx` 只负责把页面数据适配为共享 Lexical 编辑器接口。

## 4. 编辑器能力

当前已实现：

- 标题 1/2/3、正文、列表、待办、引用、代码和分割线。
- 加粗、斜体、下划线、删除线和清除格式。
- 文字颜色、背景颜色和浅色/深色语义配色。
- 字号增减、链接、对齐、撤销和重做。
- 表格插入和表格内编辑。
- 图片本地上传、缩放、四边裁剪和对齐。
- 划词快捷工具栏。
- `/` 命令菜单。
- 模板、标签、历史版本和全屏。
- 自动保存和中英文切换。

## 5. 图片节点规则

图片节点采用显式编辑态：

1. 默认只显示图片，不显示缩放、裁剪或对齐图标。
2. 单击图片后进入编辑态。
3. 点击编辑区外部或按 `Esc` 退出。
4. 缩放保存未裁切基准宽高。
5. 裁剪比例与宽高独立保存，避免二次裁切。
6. 四个裁剪控件位于边缘约 `75%` 区域。
7. 裁剪剪刀方向与所在边一致：
   - 顶部向左。
   - 右侧向上。
   - 底部向右。
   - 左侧向下。
8. 右下角等比缩放使用与手柄一致的对角图标。
9. 编辑器内禁用 Lexical 和浏览器右键菜单。

对应实现：

- 节点与交互：`lexical-tradezella-nodes.tsx`
- 视觉与手柄：`lexical-editor.css`
- 回归：`frontend/tests/e2e/notebook-slash-menu.spec.ts`

## 6. 视觉和交互约束

- 所有按钮、弹窗、Badge、Checkbox、Input 和 Tooltip 使用全局标准组件。
- 使用 TradeEZ 语义 Token，不写死颜色。
- Light / Dark 主题下共用同一套语义颜色。
- 中文和英文统一由词典维护，不散落双语文案。
- 图片、表格和插入类弹窗必须覆盖默认、悬停、聚焦、禁用和错误状态。
- 编辑器工具栏、划词工具栏和插入菜单的图标尺寸与间距保持一致。

## 7. 回归覆盖

Playwright 用例：

```text
frontend/tests/e2e/notebook-slash-menu.spec.ts
```

覆盖：

- 空笔记占位文案中英文。
- 文字颜色面板。
- 标题栏和编辑器工具栏不重叠。
- 表格插入和表格操作。
- 划词工具栏。
- `/` 命令菜单分组。
- 图片上传和单击编辑态。
- 图片缩放、连续裁剪、裁剪后缩放。
- 点击外部和 `Esc` 退出图片编辑态。
- 编辑器右键菜单关闭。

## 8. 后续扩展

- 正式附件上传服务替换 Data URL。
- AI 改写、续写和总结。
- 语音输入标准化。
- 历史版本差异对比。
- 策略 Notes 复用同一编辑器接口。
- 评论、协作和多人编辑在权限模型明确后单独设计。

## 9. 相关文档

- [笔记本模块设计](笔记本模块设计.md)
- [Notebook 需求评审](Notebook需求评审.md)
- [模块页面布局约束](../10-规则与规范/模块页面布局约束.md)
- [全局页面布局与编辑器开发总结](全局页面布局与编辑器开发总结.md)
