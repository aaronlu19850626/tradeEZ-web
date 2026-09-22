# AI 配色生成提示词

版本：1.0；状态：已确认，用于生成和评估金融 SaaS 配色方案。

## 主提示词

```text
你是一名资深金融 SaaS 产品设计师和设计系统工程师，服务对象是专业交易者、日内交易者和需要长期复盘交易数据的个人用户。

请以品牌主色 #6B4FC4（专业紫色）为视觉锚点，设计一套适合金融交易 SaaS 的完整 UI 配色系统。目标是：专业、可信、克制、高信息密度、适合长时间盯盘与复盘，不得偏消费级娱乐产品，也不得只由紫色单色堆叠。

设计要求：
1. 同时提供 Light 工作台和 Dark 工作台两套 token。
2. 主色只用于主操作、链接、选中、焦点和品牌识别，不表达盈利或亏损。
3. 交易涨跌颜色由市场决定：国内市场红涨绿跌，外汇市场绿涨红跌；警告使用琥珀色、信息使用蓝色，并保证色盲用户能通过文字、符号或形状二次识别。
4. 金额、百分比、R 倍数、仓位数量必须适合 tabular-nums 显示，前景与背景满足 WCAG AA。
5. 页面需要包含：页面背景、卡片、浮层、侧栏、输入、边框、禁用态、悬停态、选中态、焦点环、表格表头、行悬停、加载遮罩、骨架屏、成功、警告、危险、信息。
6. 图表需要提供 6 条不冲突的数据序列色，优先保证相邻序列可区分。
7. 不允许使用大面积霓虹、过饱和渐变、装饰性光斑、玻璃拟态或低对比灰字。
8. 主色悬停必须比默认色更深，浅色使用低饱和背景和同色系边框，不能只是降低透明度。

请输出三套方案：
A. Conservative Professional：稳健专业，接近成熟金融 SaaS。
B. Data Dense：更高对比、更适合高密度表格和图表。
C. Modern Trader：更现代，但仍保持商务感和可信度。

每套方案必须按以下结构输出：
1. 设计定位：一句话说明方案气质。
2. Light Token 表：token、hex、用途。
3. Dark Token 表：token、hex、用途。
4. 组件状态映射：primary、hover、active、soft、border、focus。
5. 语义状态映射：success、danger、warning、info。
6. 图表色序：chart-1 到 chart-6。
7. CSS Variables 代码块，变量命名与 shadcn 语义 token 兼容。
8. 可访问性检查：前景/背景对比度、色盲风险、表格可读性。
9. 使用建议：适合哪些页面和组件，不适合哪些场景。

固定 token 命名至少包含：
background, foreground, card, card-foreground, popover, popover-foreground,
primary, primary-foreground, primary-hover, primary-soft, primary-soft-border,
secondary, secondary-foreground, muted, muted-foreground,
accent, accent-foreground, border, input, ring,
success, success-foreground, success-soft,
danger, danger-foreground, danger-soft,
warning, warning-foreground, warning-soft,
info, info-foreground, info-soft,
chart-1, chart-2, chart-3, chart-4, chart-5, chart-6。

品牌约束：
- 主色基准：接近 #6B4FC4，但允许在 ±8% 明度和 ±5% 饱和度范围内微调。
- 页面背景以中性冷灰为主，保持交易数据的清晰层级。
- 侧栏可以使用深紫黑，但内容区必须保持低干扰。
- 盈亏红绿必须稳重，不能使用高荧光色。
- 整体风格关键词：金融、专业、理性、可信、克制、数据优先。
```

## 短提示词模板

```text
为交易者使用的金融 SaaS 生成 {{数量}} 套 UI 配色系统，锚定品牌紫 #6B4FC4。
需要 Light/Dark 双模式、shadcn 语义 token、表格与图表色序、WCAG AA 校验。
主色用于操作和选中，红绿按市场分别表达涨跌，紫色不能表达涨跌。
输出 hex、用途、CSS variables、组件状态和可访问性风险。
风格：专业、可信、克制、高密度、低干扰，不要霓虹、玻璃拟态和消费级娱乐感。
```

## 校验提示词

```text
请作为金融 SaaS 设计系统评审员，评估下面的配色方案。
检查：
1. 主色与 hover/active/soft/border 是否形成完整状态阶梯。
2. Light/Dark 是否都满足 WCAG AA。
3. 红绿是否同时通过颜色、文字和符号传达盈亏。
4. 表格表头、行悬停、输入框、焦点环是否足够清晰。
5. 6 个图表序列是否在正常视力和色弱场景下可区分。
6. 是否存在紫色泛滥、低对比灰字、霓虹色或装饰性过强的问题。
输出：问题、风险等级、替换建议、最终 token 表。
```
