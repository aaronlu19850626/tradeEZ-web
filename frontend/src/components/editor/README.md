# Editor 组件目录

版本：1.0；状态：共享实验资产，未绑定任何已确认业务需求；用途：记录当前可复用的 Lexical 编辑器能力；维护人：前端负责人；验收入口：设计系统编辑器演示。

本目录提供可复用的 Lexical 富文本编辑器。保留它是为了保存已完成的通用代码，不代表 Notebook、笔记历史或笔记模板的需求、数据模型和交互已经确认。

## 入口

- `lexical-editor.tsx`：客户端动态加载入口。
- `lexical-editor-client.tsx`：Lexical 组合、工具栏、标签条和编辑器接口。
- `lexical-editor.css`：编辑器整体布局和图片编辑样式。
- `editor-types.ts`：编辑器对外暴露的模板类型。

## 对外接口

`LexicalEditor` 接收 Markdown `value` 和 `onChange`，并暴露若干可选扩展接口。任何新模块使用前，都必须在该模块的研究、需求评审和前端 Mock 阶段重新确认所需接口，不能把现有扩展能力直接视为产品范围。

## 功能

- `lexical-toolbar-controls.tsx`：工具栏控件和下拉项。
- `lexical-toolbar-localizer.tsx`：Lexical 内部中英文映射。
- `lexical-toolbar-tooltip.tsx`：工具栏 Tooltip。
- `lexical-floating-toolbar.tsx`：划词快捷工具栏。
- `lexical-insert-dropdown.tsx`：插入图片、表格、分栏等弹窗。
- `lexical-slash-command-menu.tsx`：`/` 命令菜单。
- `lexical-tradezella-nodes.tsx`：图片、Toggle、时间轴和公式等自定义节点。
- `lexical-tradezella-icons.tsx`：编辑器专用图标。

## 约束

- 新模块立项时重新评审编辑器选型；选型结论确认前不新增第二套编辑器实现。
- 页面组件只传业务数据和回调，不直接操作 Lexical 节点内部。
- 图片节点默认只显示图片，单击后进入编辑态。
- 编辑器内不显示 Lexical 或浏览器右键菜单。
- 新增节点或菜单时必须同步补充中英文资源和 Playwright 回归。
- 历史 Notebook 方案中的编辑器结论已归档，只可用于追溯，不能作为新开发依据。
