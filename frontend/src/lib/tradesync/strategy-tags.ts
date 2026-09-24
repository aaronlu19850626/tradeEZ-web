import type { Locale } from "@/lib/i18n";

export type StrategyTagCategoryId = "traderTypes" | "technicalDirections" | "marketTypes";

export interface StrategyTagOption {
  id: string;
  labels: Record<Locale, string>;
}

export const STRATEGY_TAG_CATEGORIES: {
  id: StrategyTagCategoryId;
  labels: Record<Locale, string>;
  options: StrategyTagOption[];
}[] = [
  {
    id: "traderTypes",
    labels: { "zh-CN": "交易者类型", "en-US": "Trader type" },
    options: [
      { id: "scalper", labels: { "zh-CN": "剥头皮", "en-US": "Scalper" } },
      {
        id: "intraday_high_frequency",
        labels: { "zh-CN": "日内高频执行", "en-US": "Intraday high-frequency" },
      },
      { id: "day_trader", labels: { "zh-CN": "日内交易者", "en-US": "Day trader" } },
      { id: "swing_trader", labels: { "zh-CN": "波段交易者", "en-US": "Swing trader" } },
      { id: "position_trader", labels: { "zh-CN": "仓位交易者", "en-US": "Position trader" } },
      { id: "breakout_trader", labels: { "zh-CN": "突破交易者", "en-US": "Breakout trader" } },
      { id: "trend_follower", labels: { "zh-CN": "趋势跟随者", "en-US": "Trend follower" } },
      {
        id: "mean_reversion_trader",
        labels: { "zh-CN": "均值回归交易者", "en-US": "Mean-reversion trader" },
      },
      { id: "reversal_trader", labels: { "zh-CN": "反转交易者", "en-US": "Reversal trader" } },
      { id: "news_trader", labels: { "zh-CN": "新闻事件交易者", "en-US": "News trader" } },
      { id: "systematic", labels: { "zh-CN": "系统化交易者", "en-US": "Systematic trader" } },
      { id: "discretionary", labels: { "zh-CN": "自由裁量交易者", "en-US": "Discretionary trader" } },
      { id: "order_flow", labels: { "zh-CN": "订单流交易者", "en-US": "Order-flow trader" } },
      { id: "ict_smc", labels: { "zh-CN": "ICT / SMC 交易者", "en-US": "ICT / SMC trader" } },
      { id: "macro", labels: { "zh-CN": "宏观交易者", "en-US": "Macro trader" } },
      { id: "cross_market", labels: { "zh-CN": "跨市场交易者", "en-US": "Cross-market trader" } },
    ],
  },
  {
    id: "technicalDirections",
    labels: { "zh-CN": "交易技术方向", "en-US": "Technical direction" },
    options: [
      { id: "breakout", labels: { "zh-CN": "突破", "en-US": "Breakout" } },
      { id: "trend_following", labels: { "zh-CN": "趋势跟随", "en-US": "Trend following" } },
      { id: "mean_reversion", labels: { "zh-CN": "均值回归", "en-US": "Mean reversion" } },
      { id: "momentum", labels: { "zh-CN": "动量", "en-US": "Momentum" } },
      { id: "reversal", labels: { "zh-CN": "反转", "en-US": "Reversal" } },
      { id: "price_action", labels: { "zh-CN": "价格行为", "en-US": "Price action" } },
      { id: "supply_demand", labels: { "zh-CN": "供需区域", "en-US": "Supply and demand" } },
      { id: "liquidity", labels: { "zh-CN": "流动性与扫荡", "en-US": "Liquidity and sweeps" } },
      { id: "order_flow", labels: { "zh-CN": "订单流", "en-US": "Order flow" } },
      { id: "indicator", labels: { "zh-CN": "技术指标", "en-US": "Technical indicators" } },
      { id: "volatility", labels: { "zh-CN": "波动率", "en-US": "Volatility" } },
      { id: "event_driven", labels: { "zh-CN": "事件驱动", "en-US": "Event driven" } },
      { id: "correlation", labels: { "zh-CN": "相关性", "en-US": "Correlation" } },
    ],
  },
  {
    id: "marketTypes",
    labels: { "zh-CN": "市场类型", "en-US": "Market type" },
    options: [
      { id: "spot_gold", labels: { "zh-CN": "现货黄金", "en-US": "Spot gold" } },
      { id: "precious_metals", labels: { "zh-CN": "贵金属", "en-US": "Precious metals" } },
      { id: "forex", labels: { "zh-CN": "外汇", "en-US": "Forex" } },
      { id: "overseas_futures", labels: { "zh-CN": "海外期货", "en-US": "Overseas futures" } },
      { id: "domestic_futures", labels: { "zh-CN": "国内期货", "en-US": "Domestic futures" } },
      { id: "stocks", labels: { "zh-CN": "股票", "en-US": "Stocks" } },
      { id: "crypto", labels: { "zh-CN": "数字货币", "en-US": "Crypto" } },
      { id: "indices", labels: { "zh-CN": "指数", "en-US": "Indices" } },
    ],
  },
];

export const EMPTY_STRATEGY_TAGS = {
  traderTypes: [],
  technicalDirections: [],
  marketTypes: [],
} satisfies Record<StrategyTagCategoryId, string[]>;

export function strategyTagLabel(categoryId: StrategyTagCategoryId, tagId: string, locale: Locale) {
  const category = STRATEGY_TAG_CATEGORIES.find((item) => item.id === categoryId);
  return category?.options.find((item) => item.id === tagId)?.labels[locale] ?? tagId;
}
