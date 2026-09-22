import type { Locale } from "@/lib/i18n";

const zh = {
  filters: "筛选",
  filterTitle: "筛选器",
  filterNone: "无",
  filterActive: "已选",
  filterDirection: "方向",
  filterResult: "结果",
  filterCurrency: "币种",
  filterSymbol: "品种",
  filterAll: "全部",
  filterClear: "清除筛选",
  filterConfirm: "确认",
  filterCancel: "关闭",
  filterDefaults: "默认",
  sideBuy: "做多",
  sideSell: "做空",
  resultWin: "盈利",
  resultLoss: "亏损",

  presetAll: "全部",
  presetAllDates: "全量日期",
  presetToday: "今天",
  presetThisWeek: "本周",
  presetThisMonth: "本月",
  presetLast30: "近 30 天",
  presetLastMonth: "上月",
  presetThisQuarter: "本季度",
  presetYtd: "年初至今",

  accountScopeInclude: "点击显示该账户",
  accountScopeExclude: "点击隐藏该账户",
  accountScopeAll: "全选",
  accountScopeTitle: "账户",
  prevMonth: "上个月",
  nextMonth: "下个月",
} as const;

export type TradeFilterText = Record<keyof typeof zh, string>;

const en: TradeFilterText = {
  filters: "Filters",
  filterTitle: "Filters",
  filterNone: "None",
  filterActive: "Active",
  filterDirection: "Side",
  filterResult: "Result",
  filterCurrency: "Currency",
  filterSymbol: "Symbol",
  filterAll: "All",
  filterClear: "Clear filters",
  filterConfirm: "Apply",
  filterCancel: "Close",
  filterDefaults: "Default",
  sideBuy: "Long",
  sideSell: "Short",
  resultWin: "Wins",
  resultLoss: "Losses",

  presetAll: "All",
  presetAllDates: "All dates",
  presetToday: "Today",
  presetThisWeek: "This week",
  presetThisMonth: "This month",
  presetLast30: "Last 30 days",
  presetLastMonth: "Last month",
  presetThisQuarter: "This quarter",
  presetYtd: "Year to date",

  accountScopeInclude: "Show this account",
  accountScopeExclude: "Hide this account",
  accountScopeAll: "Select all",
  accountScopeTitle: "Accounts",
  prevMonth: "Previous month",
  nextMonth: "Next month",
};

export const tradeFilterText: Record<Locale, TradeFilterText> = {
  "zh-CN": zh,
  "en-US": en,
};
