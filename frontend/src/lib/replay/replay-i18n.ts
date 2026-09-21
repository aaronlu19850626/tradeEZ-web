import type { Locale } from "@/lib/i18n";

const zh = {
  title: "回放",
  demoBadge: "演示数据",
  subtitle: "数据为虚拟生成，用于演示回放交互；后续接入真实 tick 行情",
  playback: "回放列表",
  date: "日期",
  executions: "成交明细",
  executionsSelected: "已选 {count} 笔交易",
  selectTrade: "选择该交易",
  noTrades: "该日期没有交易",
  entry: "开仓",
  partial: "减仓",
  exit: "平仓",
  buy: "买",
  sell: "卖",
  skipStart: "跳到开始",
  stepBack: "上一步",
  play: "开始",
  pause: "暂停",
  stepForward: "下一步",
  skipEnd: "跳到结束",
  speed: "速度",
  timeframe: "周期",
  minute: "分钟",
  hour: "小时",
  progress: "进度",
  hint: "播放会逐根推进 K 线；勾选的交易会在图上标出开仓与平仓点。",
  tradeCount: "共 {count} 笔",
  loading: "图表加载中…",
};

export type ReplayText = typeof zh;

const en: ReplayText = {
  title: "Replay",
  demoBadge: "Demo data",
  subtitle: "Virtual data for the replay interaction; a real tick feed replaces it later",
  playback: "Playback",
  date: "Date",
  executions: "Executions",
  executionsSelected: "{count} trade selected",
  selectTrade: "Select this trade",
  noTrades: "No trades on this date",
  entry: "Entry",
  partial: "Partial",
  exit: "Exit",
  buy: "Buy",
  sell: "Sell",
  skipStart: "Jump to start",
  stepBack: "Previous bar",
  play: "Play",
  pause: "Pause",
  stepForward: "Next bar",
  skipEnd: "Jump to end",
  speed: "Speed",
  timeframe: "Timeframe",
  minute: "min",
  hour: "hour",
  progress: "Progress",
  hint: "Playing reveals one bar at a time; checked trades are marked on the chart.",
  tradeCount: "{count} trades",
  loading: "Loading chart…",
};

export const replayText: Record<Locale, ReplayText> = {
  "zh-CN": zh,
  "en-US": en,
};

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}
