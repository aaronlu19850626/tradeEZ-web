export interface TradingPlatform {
  value: string;
  label: string;
  icon: string;
}

export const OTHER_PLATFORM: TradingPlatform = { value: "other", label: "Other", icon: "/platforms/other.svg" };

export const TRADING_PLATFORMS: TradingPlatform[] = [
  { value: "mt5", label: "MetaTrader 5", icon: "/platforms/mt5.png" },
  { value: "mt4", label: "MetaTrader 4", icon: "/platforms/mt4.png" },
  { value: "ctrader", label: "cTrader", icon: "/platforms/ctrader.png" },
  { value: "ctp", label: "CTP", icon: "/platforms/other.svg" },
  {
    value: "interactive_brokers",
    label: "Interactive Brokers",
    icon: "/platforms/interactive-brokers.svg",
  },
  { value: "trade_station", label: "TradeStation", icon: "/platforms/tradestation.svg" },
  { value: "ninja", label: "NinjaTrader", icon: "/platforms/ninjatrader.svg" },
  { value: "trading_view", label: "TradingView", icon: "/platforms/tradingview.svg" },
  { value: "tradovate", label: "Tradovate", icon: "/platforms/tradovate.svg" },
  { value: "topstepx", label: "TopstepX", icon: "/platforms/topstepx.png" },
  { value: "trade_locker", label: "TradeLocker", icon: "/platforms/tradelocker.svg" },
  { value: "thinkorswim", label: "Thinkorswim", icon: "/platforms/thinkorswim.svg" },
  { value: "dx_trade", label: "DXtrade", icon: "/platforms/dxtrade.svg" },
  { value: "match_trader", label: "Match-Trader", icon: "/platforms/matchtrader.svg" },
  { value: "oanda", label: "OANDA", icon: "/platforms/oanda.svg" },
  { value: "bybit", label: "Bybit", icon: "/platforms/bybit.svg" },
  OTHER_PLATFORM,
];

export function findPlatform(value: string): TradingPlatform {
  return TRADING_PLATFORMS.find((platform) => platform.value === value) ?? OTHER_PLATFORM;
}
