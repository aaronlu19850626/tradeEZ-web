# Notebook 视觉对账基线

状态：进行中。

## 工作方式

- 研究浏览器 CDP 端口 9333，独立配置目录 `~/.tradeez-research-chrome`。
- 每个功能点同时产出：`screenshots/` 截图 + `metrics/` DOM/CSS 数值。
- 因为当前会话无法读取截图内容，视觉终审由用户看截图圈差异，数值作为可复现基线。

## 功能点清单与状态

| ID | 功能点 | 截图 | 数值 | 状态 |
|---|---|---|---|---|
| F01 | 目录栏 | screenshots/feature-01-directory-tall.png | metrics/feature-01-directory.json | 已抓取 |
| F02 | 笔记列表条目 | - | - | 待抓取 |
| F03 | 编辑器头部 | - | - | 待抓取 |
| F04 | 工具栏 | - | - | 待抓取 |
| F05 | 模板下拉 | - | - | 待抓取 |
| F06 | 标签面板 | - | - | 待抓取 |
| F07 | 历史版本 | - | - | 待抓取 |
