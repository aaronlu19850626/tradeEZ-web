import { type MockTrade, shanghaiDayKey } from "@/lib/tradesync/trades-mock";

import type { ColumnKey } from "./columns";

export function sortValue(trade: MockTrade, key: ColumnKey): number | string | null {
  switch (key) {
    case "date":
      return shanghaiDayKey(trade.closeTime);
    case "closeTime":
      return trade.closeTime;
    case "openTime":
      return trade.openTime;
    case "side":
      return trade.side;
    case "symbol":
      return trade.symbol;
    case "volume":
      return trade.volume;
    case "entry":
      return trade.openPrice;
    case "exit":
      return trade.closePrice;
    case "slTp":
      return trade.slPrice;
    case "net":
      return trade.netPnl;
    case "rr":
      return trade.rMultiple ?? Number.NEGATIVE_INFINITY;
    case "points":
      return trade.points;
    case "swap":
      return trade.swap;
    case "commission":
      return trade.commission;
    case "duration":
      return trade.durationSec;
    case "account":
      return trade.accountName;
    default:
      return 0;
  }
}

export function compareTrade(a: MockTrade, b: MockTrade, key: ColumnKey): number {
  const left = sortValue(a, key);
  const right = sortValue(b, key);
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}
