// Shared trade model, time helpers and client-side aggregates for the M2
// trade-center page. The page fetches closed trades from the API and runs these
// pure functions locally to build day/week groups, metrics and calendars.

export type TradeSide = "buy" | "sell";

export interface MockTrade {
  id: string;
  accountId: string;
  accountName: string;
  accountLogin?: string;
  currency?: string | null;
  magic?: number;
  symbol: string;
  side: TradeSide;
  volume: number;
  openPrice: number | null;
  closePrice: number;
  slPrice: number | null;
  tpPrice: number | null;
  /** Unix seconds, UTC. Day/week grouping uses the Beijing (UTC+8) calendar. */
  openTime: number;
  closeTime: number;
  profit: number;
  swap: number;
  commission: number;
  /** profit + swap (commission excluded). */
  grossPnl: number;
  /** gross + commission, the headline number for every view. */
  netPnl: number;
  roiPct: number | null;
  rMultiple: number | null;
  /** Signed price distance expressed in the symbol's conventional points. */
  points: number | null;
  durationSec: number;
  strategy: string | null;
  tags: string[];
}

const SHANGHAI_OFFSET = 8 * 3600;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Beijing (UTC+8) day key, e.g. "2026-09-17". */
export function shanghaiDayKey(epoch: number): string {
  return new Date((epoch + SHANGHAI_OFFSET) * 1000).toISOString().slice(0, 10);
}

/** Monday (Beijing) that contains the given epoch. */
export function shanghaiWeekStart(epoch: number): string {
  const day = shanghaiDayKey(epoch);
  const date = new Date(`${day}T00:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function addDays(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayKeyToEpoch(dayKey: string): number {
  return Math.floor(new Date(`${dayKey}T00:00:00.000Z`).getTime() / 1000) - SHANGHAI_OFFSET;
}

export interface TradeStats {
  count: number;
  gross: number;
  net: number;
  commission: number;
  swap: number;
  winners: number;
  losers: number;
  breakeven: number;
  winRate: number;
  volume: number;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** Sum of winning trades / absolute sum of losing trades. */
  winSum: number;
  lossSum: number;
  /** Arithmetic mean of the per-trade R multiples (per-trade ratio average). */
  avgR: number | null;
  /** Highest point of the running net P&L curve, ordered by close time. */
  netPeak: number;
  /** Lowest point of the running net P&L curve, ordered by close time. */
  netTrough: number;
}

export function computeStats(trades: MockTrade[]): TradeStats {
  let gross = 0;
  let net = 0;
  let commission = 0;
  let swap = 0;
  let volume = 0;
  let winners = 0;
  let losers = 0;
  let breakeven = 0;
  let winSum = 0;
  let lossSum = 0;
  let rCount = 0;
  let rSum = 0;

  for (const trade of trades) {
    gross += trade.grossPnl;
    net += trade.netPnl;
    commission += trade.commission;
    swap += trade.swap;
    volume += trade.volume;
    if (trade.netPnl > 0) {
      winners += 1;
      winSum += trade.netPnl;
    } else if (trade.netPnl < 0) {
      losers += 1;
      lossSum += -trade.netPnl;
    } else {
      breakeven += 1;
    }
    if (trade.rMultiple !== null) {
      rCount += 1;
      rSum += trade.rMultiple;
    }
  }

  // The range is read off the running net P&L curve: trades are accumulated in
  // close-time order starting from 0, and the extremes of that curve become the
  // biggest net profit and the biggest net loss inside the period.
  const ordered = [...trades].sort((a, b) => a.closeTime - b.closeTime);
  let running = 0;
  let peak = 0;
  let trough = 0;
  for (const trade of ordered) {
    running = round(running + trade.netPnl, 2);
    peak = Math.max(peak, running);
    trough = Math.min(trough, running);
  }

  const count = trades.length;
  return {
    count,
    gross: round(gross, 2),
    net: round(net, 2),
    commission: round(commission, 2),
    swap: round(swap, 2),
    winners,
    losers,
    breakeven,
    winRate: count > 0 ? winners / count : 0,
    volume: round(volume, 2),
    profitFactor: lossSum > 0 ? round(winSum / lossSum, 2) : null,
    avgWin: winners > 0 ? round(winSum / winners, 2) : null,
    avgLoss: losers > 0 ? round(lossSum / losers, 2) : null,
    winSum: round(winSum, 2),
    lossSum: round(lossSum, 2),
    avgR: rCount > 0 ? round(rSum / rCount, 2) : null,
    netPeak: round(peak, 2),
    netTrough: round(trough, 2),
  };
}

/** Running net P&L, oldest first, for the cumulative curve. */
export function cumulativeSeries(trades: MockTrade[]): { index: number; value: number }[] {
  const ordered = [...trades].sort((a, b) => a.closeTime - b.closeTime);
  let running = 0;
  const points: { index: number; value: number }[] = [{ index: 0, value: 0 }];
  ordered.forEach((trade, i) => {
    running = round(running + trade.netPnl, 2);
    points.push({ index: i + 1, value: running });
  });
  return points;
}

export interface DayGroup {
  key: string;
  weekday: number;
  trades: MockTrade[];
  stats: TradeStats;
  series: { index: number; value: number }[];
}

export function groupByDay(trades: MockTrade[]): DayGroup[] {
  const buckets = new Map<string, MockTrade[]>();
  for (const trade of trades) {
    const key = shanghaiDayKey(trade.closeTime);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(trade);
    else buckets.set(key, [trade]);
  }
  return [...buckets.entries()]
    .map(([key, list]) => ({
      key,
      weekday: new Date(`${key}T00:00:00.000Z`).getUTCDay(),
      trades: [...list].sort((a, b) => b.closeTime - a.closeTime),
      stats: computeStats(list),
      series: cumulativeSeries(list),
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

export interface WeekDayCell {
  key: string;
  weekday: number;
  net: number;
  count: number;
}

export interface WeekGroup {
  key: string;
  start: string;
  end: string;
  trades: MockTrade[];
  stats: TradeStats;
  days: WeekDayCell[];
}

export function groupByWeek(trades: MockTrade[]): WeekGroup[] {
  const buckets = new Map<string, MockTrade[]>();
  for (const trade of trades) {
    const key = shanghaiWeekStart(trade.closeTime);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(trade);
    else buckets.set(key, [trade]);
  }
  return [...buckets.entries()]
    .map(([key, list]) => {
      const days: WeekDayCell[] = [];
      for (let i = 0; i < 7; i += 1) {
        const dayKey = addDays(key, i);
        const dayTrades = list.filter((trade) => shanghaiDayKey(trade.closeTime) === dayKey);
        days.push({
          key: dayKey,
          weekday: i,
          net: round(
            dayTrades.reduce((sum, trade) => sum + trade.netPnl, 0),
            2,
          ),
          count: dayTrades.length,
        });
      }
      return {
        key,
        start: key,
        end: addDays(key, 6),
        trades: [...list].sort((a, b) => b.closeTime - a.closeTime),
        stats: computeStats(list),
        days,
      };
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

export interface CalendarCell {
  key: string;
  net: number;
  count: number;
}

export function calendarCells(trades: MockTrade[], monthKey: string): Map<string, CalendarCell> {
  const cells = new Map<string, CalendarCell>();
  for (const trade of trades) {
    const key = shanghaiDayKey(trade.closeTime);
    if (!key.startsWith(monthKey)) continue;
    const cell = cells.get(key) ?? { key, net: 0, count: 0 };
    cell.net = round(cell.net + trade.netPnl, 2);
    cell.count += 1;
    cells.set(key, cell);
  }
  return cells;
}
