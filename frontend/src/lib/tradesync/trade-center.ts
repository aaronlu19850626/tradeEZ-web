import { apiFetch } from "./api";
import type { MockTrade, TradeSide } from "./trades-mock";

/** Account shape the trade-center page uses for the page-level scope selector. */
export interface TradeAccount {
  id: string;
  name: string;
  login: string;
  currency: string | null;
  isStatistics: boolean;
  lastUpdatedAt: number | null;
}

/** Wire shape returned by ``GET /api/v1/trades`` and friends. */
export interface TradeRecord {
  id: string;
  accountId: number;
  accountName: string | null;
  accountLogin: string;
  currency: string | null;
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

export interface TradeListParams {
  accountIds?: string[];
  fromDay?: string;
  toDay?: string;
  side?: "all" | "buy" | "sell";
  result?: "all" | "win" | "loss" | "flat";
  currency?: string;
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
  symbols: () => apiFetch<string[]>("/trades/symbols"),
  currencies: () => apiFetch<string[]>("/trades/currencies"),
};
