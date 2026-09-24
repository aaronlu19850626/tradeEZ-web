# TradeZella 研究证据规范

版本：1.0；状态：已生效；用途：统一参考产品研究和复刻证据；维护人：模块负责人；验收入口：模块研究目录和 PR。

## 每个功能点必须记录

- URL、页面路径、用户状态、语言、主题、视口和缩放比例。
- 操作路径、触发元素、关闭方式、焦点回归和键盘行为。
- 默认、hover、active、focus、disabled、loading、empty、error、success 和 selected 状态。
- 截图、DOM 摘要、尺寸、间距、字体、颜色、边框、圆角、阴影、层级和滚动行为。
- 参考事实、用户规则、TradeEZ 映射和无法观察的部分。

## 证据目录

模块证据放在 `docs/30-模块设计/research/<module>/`，至少包含 `README.md`、`screenshots/`、`dom/` 和 `metrics/`。研究脚本放在 `scripts/research-browser/` 或模块测试目录，不提交账号、Cookie 或真实用户数据。

## 复刻原则

复刻结构、流程和状态；使用 TradeEZ 标准组件、Token、图标和文案。参考产品无法访问或关键状态无法触发时，记录阻塞或自主设计，不凭记忆补写证据。
