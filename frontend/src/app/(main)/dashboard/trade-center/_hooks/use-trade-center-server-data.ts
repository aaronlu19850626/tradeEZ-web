"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import { type TradeBounds, type TradeGroupRecord, toTrade, tradeCenterApi } from "@/lib/tradesync/trade-center";
import {
  type DayGroup,
  type MockTrade,
  shanghaiDayKey,
  type TradeStats,
  type WeekDayCell,
  type WeekGroup,
} from "@/lib/tradesync/trades-mock";

import type { ViewMode } from "../_lib/trade-center-model";

function toDayGroup(group: TradeGroupRecord): DayGroup {
  const trades = group.trades.map(toTrade);
  return {
    key: group.key,
    weekday: new Date(`${group.key}T00:00:00.000Z`).getUTCDay(),
    trades,
    stats: group.stats,
    series: group.series,
  };
}

function toWeekGroup(group: TradeGroupRecord): WeekGroup {
  const trades = group.trades.map(toTrade);
  const byDay = new Map<string, WeekDayCell>();
  for (const trade of trades) {
    const key = shanghaiDayKey(trade.closeTime);
    const current = byDay.get(key);
    if (current) {
      current.net += trade.netPnl;
      current.count += 1;
    } else {
      byDay.set(key, {
        key,
        weekday: new Date(`${key}T00:00:00.000Z`).getUTCDay(),
        net: trade.netPnl,
        count: 1,
      });
    }
  }
  return {
    key: group.key,
    start: group.startDay,
    end: group.endDay,
    trades,
    stats: group.stats,
    days: [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

function commonParams(
  accountIds: string[],
  range: { from: string; to: string },
  side: SideFilter,
  result: ResultFilter,
  currency: string,
  selectedSymbols: string[],
) {
  return {
    accountIds,
    fromDay: range.from || undefined,
    toDay: range.to || undefined,
    side,
    result,
    currency: currency === "all" ? undefined : currency,
    symbol: selectedSymbols.length > 0 ? selectedSymbols.join(",") : undefined,
  };
}

export function useTradeCenterServerData({
  accountIds,
  view,
  range,
  side,
  result,
  currency,
  selectedSymbols,
  page,
  dayVisible,
  weekVisible,
  sort,
  order,
}: {
  accountIds: string[];
  view: ViewMode;
  range: { from: string; to: string };
  side: SideFilter;
  result: ResultFilter;
  currency: string;
  selectedSymbols: string[];
  page: number;
  dayVisible: number;
  weekVisible: number;
  sort?: string;
  order?: "asc" | "desc";
}) {
  const [bounds, setBounds] = useState<TradeBounds>({ earliestDay: null, latestDay: null });
  const [symbols, setSymbols] = useState<string[]>([]);
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [weekGroups, setWeekGroups] = useState<WeekGroup[]>([]);
  const [dayHasMore, setDayHasMore] = useState(false);
  const [weekHasMore, setWeekHasMore] = useState(false);
  const [pageTrades, setPageTrades] = useState<MockTrade[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [summary, setSummary] = useState<TradeStats | null>(null);
  const [summarySeries, setSummarySeries] = useState<{ index: number; value: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastPageRef = useRef(page);
  const lastSortRef = useRef<string>(`${sort ?? ""}|${order ?? ""}`);
  const lastDayVisibleRef = useRef(dayVisible);
  const lastWeekVisibleRef = useRef(weekVisible);

  useEffect(() => {
    if (accountIds.length === 0) return;
    void tradeCenterApi
      .bounds({ accountIds })
      .then(setBounds)
      .catch(() => setBounds({ earliestDay: null, latestDay: null }));
    void tradeCenterApi
      .symbols()
      .then(setSymbols)
      .catch(() => undefined);
  }, [accountIds]);

  const load = useCallback(
    async (pageOnly = false) => {
      if (accountIds.length === 0) return;
      if (!range.from || !range.to) {
        setLoading(false);
        return;
      }
      if (pageOnly) setPageLoading(true);
      else setLoading(true);
      setError(false);
      try {
        const params = commonParams(accountIds, range, side, result, currency, selectedSymbols);
        if (view === "day") {
          const groups = await tradeCenterApi.groups({ ...params, view: "day", limit: dayVisible + 1, offset: 0 });
          setDayGroups(groups.slice(0, dayVisible).map(toDayGroup));
          setDayHasMore(groups.length > dayVisible);
        } else if (view === "week") {
          const groups = await tradeCenterApi.groups({ ...params, view: "week", limit: weekVisible + 1, offset: 0 });
          setWeekGroups(groups.slice(0, weekVisible).map(toWeekGroup));
          setWeekHasMore(groups.length > weekVisible);
        } else {
          const [pageData, summaryData] = await Promise.all([
            tradeCenterApi.list({ ...params, page, pageSize: 100, sort, order }),
            tradeCenterApi.summary(params),
          ]);
          setPageTrades(pageData.items.map(toTrade));
          setPageTotal(pageData.total);
          setSummary(summaryData.stats);
          setSummarySeries(summaryData.series);
        }
        setLoaded(true);
      } catch {
        setError(true);
      } finally {
        if (pageOnly) setPageLoading(false);
        else setLoading(false);
      }
    },
    [accountIds, currency, dayVisible, order, page, range, result, selectedSymbols, side, sort, view, weekVisible],
  );

  useEffect(() => {
    const sortKey = `${sort ?? ""}|${order ?? ""}`;
    const pageOnly =
      view === "all"
        ? page !== lastPageRef.current || sortKey !== lastSortRef.current
        : view === "day"
          ? dayVisible !== lastDayVisibleRef.current
          : weekVisible !== lastWeekVisibleRef.current;
    lastPageRef.current = page;
    lastSortRef.current = sortKey;
    lastDayVisibleRef.current = dayVisible;
    lastWeekVisibleRef.current = weekVisible;
    void load(pageOnly);
  }, [dayVisible, load, order, page, sort, view, weekVisible]);

  return {
    bounds,
    dayHasMore,
    dayGroups,
    error,
    loaded,
    loading,
    pageLoading,
    pageTotal,
    pageTrades,
    reload: load,
    summary,
    summarySeries,
    symbols,
    weekHasMore,
    weekGroups,
  };
}
