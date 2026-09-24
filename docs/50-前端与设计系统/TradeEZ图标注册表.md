---
doc_id: DESIGN-ICONS
status: active
owner: frontend-owner
last_verified: 2026-09-24
---

# TradeEZ 图标注册表

版本：1.1；状态：共享资产索引；用途：记录已采集的 TradeZella SVG 资产；维护人：前端负责人；验收入口：设计系统图标页。

注册表中存在从历史页面采集的名称，只代表图标资产来源，不代表对应模块、功能或交互已进入 TradeEZ 范围。

## 数据源

- 研究页面：参考产品研究记录；来源不代表 TradeEZ 模块已经进入一期。
- 采集方式：研究浏览器真实 DOM 源码抽取并按 SVG `outerHTML` 去重，复杂弹层补充项同步收录。
- 注册表：[icon-registry.json](../../frontend/src/components/icons/tradezella/icon-registry.json)。
- 通用组件：[tradezella-icon.tsx](../../frontend/src/components/icons/tradezella/tradezella-icon.tsx)。

## 使用方式

```tsx
import { TradeZellaIcon } from "@/components/icons/tradezella";

<TradeZellaIcon name="editor.bold" size={16} />
```

## 约束

1. 新复刻页面优先使用稳定语义名，不直接复制 SVG 到业务组件。
2. 图标默认尺寸必须按页面记录使用；没有记录时使用 `16`。
3. 禁止用字母、emoji、近似 Lucide 图标替代已有注册表图标。
4. 新图标必须附来源页面、真实 DOM、`viewBox` 和默认尺寸。
5. 图标颜色统一使用 `currentColor`，尺寸由外部容器控制。

## 分组目录

### action (8)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `action.add` | Add Trade | 0 0 24 24 | 20×20 |
| `action.add-39` | New note | 0 0 24 24 | 20×20 |
| `action.delete` | DeleteOutlineOutlinedIcon | 0 0 24 24 | 18×18 |
| `action.favorite` | Add to favorites | 0 0 24 24 | 18×18 |
| `action.share` | Click to share note | 0 0 24 24 | 18×18 |
| `action.import` | Import | 0 0 24 24 | 15×11 |
| `action.export` | Export | 0 0 24 24 | 15×11 |
| `action.delete-78` | Delete | 0 0 24 24 | 15×11 |

### control (8)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `control.dropdown-filled` | All accounts | 0 0 24 24 | 16×16 |
| `control.collapse` | Collapse | 0 0 24 24 | 20×20 |
| `control.filter` | Filters | 0 0 24 24 | 20×20 |
| `control.chevron-right` | ChevronRightIcon | 0 0 24 24 | 16×16 |
| `control.more-horizontal` | More options | 0 0 24 24 | 20×20 |
| `control.checkbox` | CheckBoxOutlineBlankIcon | 0 0 24 24 | 20×20 |
| `control.drag-indicator` | DragIndicatorIcon | 0 0 24 24 | 16×16 |
| `control.chevron-down` | Formatting options for text style | 0 0 24 24 | 16×16 |

### date (1)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `date.calendar-today` | CalendarTodayOutlinedIcon | 0 0 24 24 | 18×18 |

### editor (40)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `editor.speech` | Enable speech to text | 0 0 24 24 | 20×20 |
| `editor.templates` | Templates | 0 0 24 24 | 20×20 |
| `editor.font-family` | Formatting options for font family | 0 0 24 24 | 16×16 |
| `editor.font-decrease` | Decrease font size | 0 0 24 24 | 20×20 |
| `editor.bold` | Formatting options for inline text style | 0 0 24 24 | 20×20 |
| `editor.link` | Insert link | 0 0 24 24 | 20×20 |
| `editor.clear-format` | Clear text formatting | 0 0 24 24 | 20×20 |
| `editor.text-color` | Formatting text color | 0 0 24 24 | 20×20 |
| `editor.background-color` | Formatting background color | 0 0 24 24 | 20×20 |
| `editor.undo` | Undo | 0 0 24 24 | 20×20 |
| `editor.redo` | Redo | 0 0 24 24 | 20×20 |
| `editor.history` | Version history | 0 0 24 24 | 20×20 |
| `editor.fullscreen` | Enter Fullscreen | 0 0 24 24 | 20×20 |
| `editor.inline-image` | Inline image | 0 0 16 16 | 16×16 |
| `editor.toggle` | Toggle | 0 0 16 16 | 16×16 |
| `editor.timed-list` | Timed List | 0 0 16 16 | 16×16 |
| `editor.collapsible` | Collapsible container | 0 0 16 16 | 16×16 |
| `editor.x` | X(Tweet) | 0 0 16 16 | 16×16 |
| `editor.youtube` | YouTube video | 0 0 16 16 | 16×16 |
| `editor.horizontal-rule` | Horizontal rule | 0 0 16 16 | 16×16 |
| `editor.page-break` | Page break | 0 0 16 16 | 16×16 |
| `editor.image` | Image | 0 0 16 16 | 16×16 |
| `editor.table` | Table | 0 0 16 16 | 16×16 |
| `editor.columns` | Columns layout | 0 0 16 16 | 16×16 |
| `editor.equation` | Equation | 0 0 16 16 | 16×16 |
| `editor.check-list` | Check list | 0 0 16 16 | 16×16 |
| `editor.quote` | Quote | 0 0 16 16 | 16×16 |
| `editor.code-block` | Code block | 0 0 16 16 | 16×16 |
| `editor.align-left` | align-left | 0 0 16 16 | 16×16 |
| `editor.align-center` | align-center | 0 0 16 16 | 16×16 |
| `editor.align-right` | align-right | 0 0 16 16 | 16×16 |
| `editor.align-justify` | align-justify | 0 0 16 16 | 16×16 |
| `editor.outdent` | outdent | 0 0 16 16 | 16×16 |
| `editor.indent` | indent | 0 0 16 16 | 16×16 |
| `editor.align-start` | align-start | 0 0 16 16 | 16×16 |
| `editor.align-end` | align-end | 0 0 16 16 | 16×16 |
| `editor.text-normal` | text-normal | 0 0 16 16 | 16×16 |
| `editor.text-h1` | text-h1 | 0 0 16 16 | 16×16 |
| `editor.text-h2` | text-h2 | 0 0 16 16 | 16×16 |
| `editor.text-h3` | text-h3 | 0 0 16 16 | 16×16 |

### legacy (7)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `legacy.notifications` | Notifications | 0 0 20 20 | 20×20 |
| `legacy.custom-33` | - | 0 0 20 20 | 20×20 |
| `legacy.custom-43` | - | 0 0 24 24 | 24×24 |
| `legacy.formatting-options-for-text-style` | Formatting options for text style | 0 0 16 16 | 16×16 |
| `legacy.formatting-options-for-text-alignment` | Formatting options for text alignment | - | 16×16 |
| `legacy.click-to-add-below` | Click to add below | 0 0 10 17 | 18×18 |
| `legacy.custom-71` | - | 0 0 24 24 | 20×20 |

### nav (27)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `nav.home` | Home | 0 0 24 24 | 20×20 |
| `nav.home-filled` | Home | 0 0 24 24 | -×- |
| `nav.journal` | Journal | 0 0 24 24 | -×- |
| `nav.journal-filled` | Journal | 0 0 24 24 | 20×20 |
| `nav.backtesting` | Backtesting | 0 0 24 24 | 20×20 |
| `nav.backtesting-filled` | Backtesting | 0 0 24 24 | -×- |
| `nav.agents` | Agents | 0 0 24 24 | 20×20 |
| `nav.agents-filled` | Agents | 0 0 24 24 | -×- |
| `nav.mentor-mode` | Mentor Mode | 0 0 24 24 | 20×20 |
| `nav.mentor-mode-filled` | Mentor Mode | 0 0 24 24 | -×- |
| `nav.prop-firm-sync` | PropFirm Sync | 0 0 24 24 | 20×20 |
| `nav.prop-firm-sync-filled` | PropFirm Sync | 0 0 24 24 | -×- |
| `nav.contact` | Contact us | 0 0 24 24 | 20×20 |
| `nav.contact-filled` | Contact us | 0 0 24 24 | -×- |
| `nav.university` | Zella University | 0 0 24 24 | 20×20 |
| `nav.university-filled` | Zella University | 0 0 24 24 | -×- |
| `nav.referral` | Referral Program | 0 0 24 24 | 20×20 |
| `nav.referral-filled` | Referral Program | 0 0 24 24 | -×- |
| `nav.dashboard` | Dashboard | 0 0 24 24 | 20×20 |
| `nav.trades` | Trades | 0 0 24 24 | 20×20 |
| `nav.notebook` | Notebook | 0 0 24 24 | 20×20 |
| `nav.reports` | Reports | 0 0 24 24 | 20×20 |
| `nav.strategies` | Playbooks/Strategies | 0 0 24 24 | 20×20 |
| `nav.replay` | Trade Replay | 0 0 24 24 | 20×20 |
| `nav.progress` | Progress Tracker | 0 0 24 24 | 20×20 |
| `nav.resources` | Resources | 0 0 24 24 | 20×20 |
| `nav.resources-46` | FolderOutlinedIcon | 0 0 24 24 | 18×18 |

### notebook (11)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `notebook.page` | DescriptionOutlinedIcon | 0 0 24 24 | 18×18 |
| `notebook.favorite` | StarRoundedIcon | 0 0 24 24 | 18×18 |
| `notebook.stats` | BarChartOutlinedIcon | 0 0 24 24 | 18×18 |
| `notebook.trade-note` | PsychologyOutlinedIcon | 0 0 24 24 | 18×18 |
| `notebook.tags` | Tags | 0 0 24 24 | 18×18 |
| `notebook.daily-journal` | EventIcon | 0 0 24 24 | 24×24 |
| `notebook.tags-55` | Tags | 0 0 24 24 | 20×20 |
| `notebook.full-width` | Full width | 0 0 24 24 | 15×11 |
| `notebook.show-toolbar` | Show toolbar | 0 0 24 24 | 15×11 |
| `notebook.recommended` | Daily Game Plan | 0 0 24 24 | 15×11 |
| `notebook.manage-templates` | Manage Templates | 0 0 24 24 | 15×11 |

### shell (2)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `shell.menu` | menu-burger | 0 0 24 24 | 20×20 |
| `shell.profile` | Open profile menu | 0 0 24 24 | 20×20 |

### status (1)

| 名称 | 原页面标签 | viewBox | 默认尺寸 |
|---|---|---|---|
| `status.success` | CheckCircleOutlineIcon | 0 0 24 24 | 16×16 |
