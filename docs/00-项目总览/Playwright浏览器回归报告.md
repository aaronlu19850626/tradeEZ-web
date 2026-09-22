# Playwright 浏览器回归报告

版本：1.0；状态：本轮全量通过。

## 1. 执行环境

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`
- 数据库：本地 PostgreSQL `tradeez_dev`
- 浏览器：本机 Google Chrome，通过 Playwright `channel: "chrome"` 启动
- 测试账号：`chentodd@qq.com`
- 登录方式：开发测试模式，固定验证码 `123456`，自动生成并复用登录态
- 测试数据：8 个账户，其中 6 个 MT5 外汇账户、2 个 CTP 人民币期货账户

## 2. 测试范围

| 视口 | 尺寸 |
|---|---:|
| Desktop | 1440 × 960 |
| Tablet | 1024 × 900 |
| Mobile | 390 × 844 |

覆盖页面：

- `/dashboard/account-center`
- `/dashboard/trade-center`
- `/dashboard/overview`

覆盖功能：

- 自动登录和仪表盘访问。
- 国内市场、外汇市场徽标和颜色。
- 多条件筛选器左右布局、条件顺序、已选条件快速删除。
- 默认 `外汇市场 + USD` 及删除后恢复默认。
- 品种账户聚合、账户名称下方展示和固定高度滚动。
- 国内市场月历数字与盈亏线条颜色一致。
- 做多、做空描边图标徽标。
- 总览最近交易方向字段。
- 账户创建表单默认值、必填校验和 CTP/CNY 锁定。
- 账户改名、统计开关、密钥查看、密钥重置和物理删除。
- MT5 完整生命周期：UI 创建、签名同步、部分平仓、重复批次、游标推进、页面查询、交易重置、重新同步、密钥轮换和最终删除。
- 核心页面控制台和运行时异常监控。

## 3. 执行命令

```bash
cd frontend
npm run test:e2e
```

单独运行视口：

```bash
npx playwright test --project=desktop
npx playwright test --project=tablet
npx playwright test --project=mobile
```

## 4. 结果

最终标准执行结果：

- 预期用例：52
- 通过：52
- 失败：0
- 跳过：0
- 不稳定：0
- 总耗时：约 258 秒

分层结果：

| 层级 | 数量 | 结果 |
|---|---:|---|
| Setup | 1 | 通过 |
| Desktop | 17 | 通过 |
| Tablet | 17 | 通过 |
| Mobile | 17 | 通过 |

报告产物：

- HTML：`frontend/playwright-report/index.html`
- JSON：`frontend/test-results/playwright-results.json`
- Trace：仅在失败时生成，位于 `frontend/test-results/`

完整生命周期证据包：

- 证据索引：`frontend/test-results/evidence/index.html`
- 全程视频：`frontend/test-results/evidence-artifacts/.../video.webm`
- 生命周期 Trace：`frontend/test-results/evidence-artifacts/.../trace.zip`
- 关键步骤截图：`frontend/test-results/evidence/lifecycle-evidence/`
- 证据 HTML 报告：`frontend/playwright-evidence-report/index.html`

## 5. 本轮发现并修正

| 编号 | 问题 | 处理 |
|---|---|---|
| PW-01 | 自动登录 API 请求路径覆盖 `/api/v1`，导致 404 | 修正测试夹具 API base URL 和相对路径 |
| PW-02 | Playwright 视频录制依赖未下载，阻止浏览器启动 | 关闭视频录制，保留失败截图和 Trace |
| PW-03 | URL 深链进入 `CNY + 国内市场` 时被旧默认保护逻辑改回 `USD + 外汇市场` | 移除旧强制覆盖逻辑，保留深链条件 |
| PW-04 | 筛选器测试因“市场”与“市场：外汇市场”文案冲突触发严格选择器错误 | 测试改用精确匹配 |
| PW-05 | 总览方向字段测试作用域错误 | 改为通过表头定位 |
| PW-06 | 月历日期 aria-label 使用非补零月份，测试选择器不匹配 | 修正定位方式并直接比较数字与线条颜色 |
| PW-07 | 账户创建、改名和删除流程未纳入回归 | 新增账户生命周期测试，覆盖三档视口 |
| PW-08 | 重复提交包含部分平仓的成交批次返回 500 | 修复 PostgreSQL 对 `timezone_profile_id` 的参数类型推断，补充重复同步后端用例 |
| PW-09 | 移动端总览月历日期滚动到视口后，吸顶筛选栏可能拦截点击 | 增加日历格滚动留白并纳入移动端回归 |

## 6. 残留风险

- Recharts 在部分初始隐藏容器中仍可能输出 `width(-1) and height(-1)` 警告，本轮作为已知非阻塞警告排除，后续性能与布局专项处理。
- 本轮验证功能正确性，不包含 12 万笔以上数据下的严格性能阈值；完整生命周期使用小样本数据完成闭环。
- 未重新执行 production build。
- Playwright 浏览器下载 CDN 请求超时，因此使用本机 Google Chrome；CI 环境需要提前安装 Chromium 或允许下载。

## 7. 结论

本轮 52 项浏览器回归全部通过。自动化覆盖已经能够验证账户导入、三种交易视图、列显示、分页排序、总览评分、累计全屏、交易时段设置、日历复用和 MT5 账户从创建到删除的完整生命周期。后端测试同步保持 91 项通过。可以进入下一阶段：统计查询性能优化和全局组件迁移范围评审。
