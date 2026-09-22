import { apiFetch } from "./api";
import type { ScoreDimensionKey } from "./trade-score";
import type { MockTrade, TradeSide, TradeStats } from "./trades-mock";

export type MarketProfile = "cn" | "fx";

/** Account shape the trade-center page uses for the page-level scope selector. */
export interface TradeAccount {
  id: string;
  name: string;
  login: string;
  currency: string | null;
  marketProfile: MarketProfile;
  isStatistics: boolean;
  tradeCount: number;
  lastUpdatedAt: number | null;
}

/** Wire shape returned by ``GET /api/v1/trades`` and friends. */
export interface TradeRecord {
  id: string;
  accountId: number;
  accountName: string | null;
  accountLogin: string;
  currency: string | null;
  marketProfile: MarketProfile;
  symbol: string;
  side: TradeSide;
  volume: number;
  openPrice: number | null;
  closePrice: number;
  slPrice: number | null;
  tpPrice: number | null;
  openTime: number;
  closeTime: number;
  profit: number;
  swap: number;
  commission: number;
  grossPnl: number;
  netPnl: number;
  roiPct: number | null;
  rMultiple: number | null;
  points: number | null;
  durationSec: number;
  strategy: string | null;
  magic: number;
}

export interface TradePage {
  items: TradeRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface TradeBounds {
  earliestDay: string | null;
  latestDay: string | null;
}

export interface TradeSymbolOption {
  symbol: string;
  accounts: { account_id: number; account_name: string }[];
}

export interface TradeSummaryRecord {
  stats: TradeStats;
  series: { index: number; value: number }[];
}

export interface TradeGroupRecord {
  key: string;
  startDay: string;
  endDay: string;
  stats: TradeStats;
  series: { index: number; value: number }[];
  trades: TradeRecord[];
}

export interface CalendarDayRecord {
  day: string;
  net: number;
  count: number;
}

export interface OverviewDayRecord {
  day: string;
  net: number;
  count: number;
  wins: number;
}

export interface OverviewPointRecord {
  date: string;
  label: string;
  value: number;
}

export interface OverviewScoreDimensionRecord {
  key: ScoreDimensionKey;
  weight: number;
  raw: number | null;
  score: number;
}

export interface OverviewScoreRecord {
  insufficient: boolean;
  sampleTrades: number;
  validR: number;
  total: number | null;
  dimensions: OverviewScoreDimensionRecord[];
  weakest: ScoreDimensionKey[];
}

export interface OverviewConsistencyCellRecord {
  day: string;
  net: number;
  count: number;
  intensity: number;
}

export interface OverviewScatterPointRecord {
  x: number;
  y: number;
}

export interface OverviewRecentRecord {
  id: string;
  closeTime: number;
  symbol: string;
  side: TradeSide;
  netPnl: number;
}

export interface TradeOverviewRecord {
  stats: {
    count: number;
    net: number;
    winners: number;
    losers: number;
    breakEven: number;
    winRate: number;
    profitFactor: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    winDays: number;
    flatDays: number;
    lossDays: number;
    dayWinRate: number;
    days: OverviewDayRecord[];
  };
  score: OverviewScoreRecord;
  cumulative: OverviewPointRecord[];
  cumulativeRecent: OverviewPointRecord[];
  drawdown: { points: OverviewPointRecord[]; maxDrawdown: number };
  recent: OverviewRecentRecord[];
  consistency: { cells: OverviewConsistencyCellRecord[]; weeks: string[] };
  timeEntry: OverviewScatterPointRecord[];
  timeExit: OverviewScatterPointRecord[];
  duration: OverviewScatterPointRecord[];
}

export interface TradeListParams {
  accountIds?: string[];
  fromDay?: string;
  toDay?: string;
  side?: "all" | "buy" | "sell";
  result?: "all" | "win" | "loss" | "flat";
  currency?: string;
  marketProfile?: MarketProfile;
  symbol?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

function toQuery(params: TradeListParams): string {
  const query = new URLSearchParams();
  if (params.accountIds?.length) query.set("account_ids", params.accountIds.join(","));
  if (params.fromDay) query.set("from_day", params.fromDay);
  if (params.toDay) query.set("to_day", params.toDay);
  if (params.side) query.set("side", params.side);
  if (params.result) query.set("result", params.result);
  if (params.currency) query.set("currency", params.currency);
  if (params.marketProfile) query.set("market_profile", params.marketProfile);
  if (params.symbol) query.set("symbol", params.symbol);
  if (params.sort) query.set("sort", params.sort);
  if (params.order) query.set("order", params.order);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("page_size", String(params.pageSize));
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function toTrade(record: TradeRecord): MockTrade {
  return {
    id: record.id,
    accountId: String(record.accountId),
    accountName: record.accountName ?? record.accountLogin,
    accountLogin: record.accountLogin,
    currency: record.currency,
    marketProfile: record.marketProfile,
    magic: record.magic,
    symbol: record.symbol,
    side: record.side,
    volume: record.volume,
    openPrice: record.openPrice,
    closePrice: record.closePrice,
    slPrice: record.slPrice,
    tpPrice: record.tpPrice,
    openTime: record.openTime,
    closeTime: record.closeTime,
    profit: record.profit,
    swap: record.swap,
    commission: record.commission,
    grossPnl: record.grossPnl,
    netPnl: record.netPnl,
    roiPct: record.roiPct,
    rMultiple: record.rMultiple,
    points: record.points,
    durationSec: record.durationSec,
    strategy: record.strategy,
    tags: [],
  };
}

export const tradeCenterApi = {
  list: (params: TradeListParams = {}) => apiFetch<TradePage>(`/trades${toQuery(params)}`),
  summary: (params: TradeListParams = {}) => apiFetch<TradeSummaryRecord>(`/trades/summary${toQuery(params)}`),
  overview: (params: TradeListParams = {}) => apiFetch<TradeOverviewRecord>(`/trades/overview${toQuery(params)}`),
  groups: (params: TradeListParams & { view: "day" | "week"; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    query.set("view", params.view);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const base = new URLSearchParams(toQuery(params).replace(/^\?/, ""));
    for (const [key, value] of base) query.set(key, value);
    return apiFetch<TradeGroupRecord[]>(`/trades/groups?${query.toString()}`);
  },
  bounds: (params: TradeListParams = {}) => apiFetch<TradeBounds>(`/trades/bounds${toQuery(params)}`),
  calendar: (params: TradeListParams & { month: string }) => {
    const query = new URLSearchParams();
    query.set("month", params.month);
    const base = new URLSearchParams(toQuery(params).replace(/^\?/, ""));
    for (const [key, value] of base) query.set(key, value);
    return apiFetch<CalendarDayRecord[]>(`/trades/calendar?${query.toString()}`);
  },
  symbols: (params: TradeListParams = {}) => apiFetch<string[]>(`/trades/symbols${toQuery(params)}`),
  symbolOptions: (params: TradeListParams = {}) =>
    apiFetch<TradeSymbolOption[]>(`/trades/symbol-options${toQuery(params)}`),
  currencies: () => apiFetch<string[]>("/trades/currencies"),
};
