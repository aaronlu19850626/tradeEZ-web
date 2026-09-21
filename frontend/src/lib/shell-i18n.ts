import type { Locale } from "@/lib/i18n";

const zh = {
  slogan: "让复盘更简单，让进步看得见",
  sidebarToggle: "展开或收起侧栏",
  groupMain: "交易工作台",
  badgeNew: "新",
  badgeSoon: "稍后",
  navToday: "今日总览",
  navOverview: "交易总览",
  navAi: "AI 中心",
  navReplay: "行情回放",
  navChartLab: "图表实验室",
  navDesignSystem: "组件样式",
  navAccounts: "交易账户",
  navTrades: "交易记录",
  navOrders: "完整订单",
  navReviews: "交易复盘",
  navTags: "标签管理",
  navPlaybooks: "模型与规则",
  navRawDeals: "原始成交",
  navSyncLogs: "同步日志",
  navAnalytics: "交易分析",
  navCalendar: "交易日历",
  navSettings: "工作区设置",
  navWeekly: "周复盘与行动",
  navHabits: "习惯与提醒",
  mt5Accounts: "账户",
  mt5EaOnline: "EA 同步",
  mt5StatusLoading: "读取中",
  mt5StatusFailed: "状态读取失败，显示上次数据",
  tradeezUser: "TradeEZ 用户",
  notLoggedIn: "未登录",
  logout: "退出登录",
  metaTitle: "TradeEZ - 交易复盘与执行管理",
  metaDescription: "TradeEZ Web 是 MT5 EA 订单同步、交易复盘、规则评分与每日交易闭环的管理控制台。",
} as const;

export type ShellText = Record<keyof typeof zh, string>;

const en: ShellText = {
  slogan: "Simpler reviews, visible progress",
  sidebarToggle: "Expand or collapse sidebar",
  groupMain: "Trading workspace",
  badgeNew: "New",
  badgeSoon: "Soon",
  navToday: "Overview",
  navOverview: "Trading overview",
  navAi: "AI center",
  navReplay: "Replay",
  navChartLab: "Chart lab",
  navDesignSystem: "Design system",
  navAccounts: "Trading accounts",
  navTrades: "Trades",
  navOrders: "All orders",
  navReviews: "Trade reviews",
  navTags: "Tags",
  navPlaybooks: "Setups & rules",
  navRawDeals: "Raw deals",
  navSyncLogs: "Sync logs",
  navAnalytics: "Analytics",
  navCalendar: "Calendar",
  navSettings: "Workspace settings",
  navWeekly: "Weekly review",
  navHabits: "Habits & reminders",
  mt5Accounts: "Accounts",
  mt5EaOnline: "EA online",
  mt5StatusLoading: "Loading",
  mt5StatusFailed: "Status unavailable, showing last data",
  tradeezUser: "TradeEZ User",
  notLoggedIn: "Not signed in",
  logout: "Sign out",
  metaTitle: "TradeEZ - Trading Review & Execution",
  metaDescription:
    "TradeEZ Web is the control center for MT5 EA order sync, trade review, rule scoring and daily execution.",
};

export const shellText: Record<Locale, ShellText> = {
  "zh-CN": zh,
  "en-US": en,
};

const NAV_KEYS: Record<string, keyof ShellText> = {
  today: "navToday",
  overview: "navOverview",
  ai: "navAi",
  replay: "navReplay",
  "chart-lab": "navChartLab",
  "design-system": "navDesignSystem",
  accounts: "navAccounts",
  trades: "navTrades",
  orders: "navOrders",
  reviews: "navReviews",
  tags: "navTags",
  playbooks: "navPlaybooks",
  "raw-deals": "navRawDeals",
  "sync-logs": "navSyncLogs",
  analytics: "navAnalytics",
  calendar: "navCalendar",
  settings: "navSettings",
  weekly: "navWeekly",
  habits: "navHabits",
};

export function navTitle(t: ShellText, id: string, fallback: string): string {
  const key = NAV_KEYS[id];
  return key ? t[key] : fallback;
}

export { fill } from "@/lib/i18n";
