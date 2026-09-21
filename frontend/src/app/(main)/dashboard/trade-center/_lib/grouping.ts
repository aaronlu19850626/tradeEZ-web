import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import { type MockTrade, shanghaiDayKey } from "@/lib/tradesync/trades-mock";

export function matchSide(trade: MockTrade, side: SideFilter): boolean {
  return side === "all" || trade.side === side;
}

export function matchResult(trade: MockTrade, result: ResultFilter): boolean {
  if (result === "all") return true;
  if (result === "win") return trade.netPnl > 0;
  return trade.netPnl < 0;
}

export function inRange(trade: MockTrade, from: string, to: string): boolean {
  const key = shanghaiDayKey(trade.closeTime);
  return key >= from && key <= to;
}
