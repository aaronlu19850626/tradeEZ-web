"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import {
  type TradeBounds,
  type TradeGroupRecord,
  type TradeSymbolOption,
  toTrade,
  tradeCenterApi,
} from "@/lib/tradesync/trade-center";
import type { DayGroup, MockTrade, TradeStats, WeekDayCell, WeekGroup } from "@/lib/tradesync/trades-mock";

import { ALL_TRADES_PAGE_SIZE, type ViewMode } from "../_lib/trade-center-model";

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
  return {
    key: group.key,
    start: group.startDay,
    end: group.endDay,
    trades: group.trades.map(toTrade),
    stats: group.stats,
    days: group.days.map<WeekDayCell>((day) => ({
      key: day.day,
      weekday: new Date(`${day.day}T00:00:00.000Z`).getUTCDay(),
      net: day.net,
      count: day.count,
    })),
  };
}

function commonParams(
  accountIds: string[],
  range: { from: string; to: string },
  side: SideFilter,
  result: ResultFilter,
  currency: string,
  marketProfile: "cn" | "fx",
  selectedSymbols: string[],
) {
  return {
    accountIds,
    fromDay: range.from || undefined,
    toDay: range.to || undefined,
    side,
    result,
    currency: currency === "all" ? undefined : currency,
    marketProfile,
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
  marketProfile,
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
  marketProfile: "cn" | "fx";
  selectedSymbols: string[];
  page: number;
  dayVisible: number;
  weekVisible: number;
  sort?: string;
  order?: "asc" | "desc";
}) {
  const [bounds, setBounds] = useState<TradeBounds>({ earliestDay: null, latestDay: null });
  const [symbolOptions, setSymbolOptions] = useState<TradeSymbolOption[]>([]);
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [weekGroups, setWeekGroups] = useState<WeekGroup[]>([]);
  const [dayHasMore, setDayHasMore] = useState(false);
  const [weekHasMore, setWeekHasMore] = useState(false);
  const [pageTrades, setPageTrades] = useState<MockTrade[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [summary, setSummary] = useState<TradeStats | null>(null);
  const [summarySeries, setSummarySeries] = useState<{ index: number; value: number }[]>([]);
  const [groupTradesLoading, setGroupTradesLoading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastPageRef = useRef(page);
  const lastSortRef = useRef<string>(`${sort ?? ""}|${order ?? ""}`);
  const lastDayVisibleRef = useRef(dayVisible);
  const lastWeekVisibleRef = useRef(weekVisible);
  const groupTradeCacheRef = useRef(new Map<string, MockTrade[]>());
  const filterScopeKey = [
    accountIds.join(","),
    range.from,
    range.to,
    side,
    result,
    currency,
    marketProfile,
    selectedSymbols.join(","),
  ].join("|");

  useEffect(() => {
    if (accountIds.length === 0) return;
    void tradeCenterApi
      .bounds({ accountIds })
      .then(setBounds)
      .catch(() => setBounds({ earliestDay: null, latestDay: null }));
    void tradeCenterApi
      .symbolOptions({
        accountIds,
        currency: currency === "all" ? undefined : currency,
        marketProfile,
      })
      .then(setSymbolOptions)
      .catch(() => undefined);
  }, [accountIds, currency, marketProfile]);

  useEffect(() => {
    void filterScopeKey;
    groupTradeCacheRef.current.clear();
    setGroupTradesLoading({});
  }, [filterScopeKey]);

  const loadGroupTrades = useCallback(
    async (mode: "day" | "week", key: string) => {
      const cacheKey = `${mode}:${key}`;
      const cached = groupTradeCacheRef.current.get(cacheKey);
      if (cached) return cached;
      setGroupTradesLoading((previous) => ({ ...previous, [cacheKey]: true }));
      try {
        const records = await tradeCenterApi.groupTrades({
          ...commonParams(accountIds, range, side, result, currency, marketProfile, selectedSymbols),
          view: mode,
          key,
        });
        const trades = records.map(toTrade);
        groupTradeCacheRef.current.set(cacheKey, trades);
        if (mode === "day") {
          setDayGroups((previous) => previous.map((group) => (group.key === key ? { ...group, trades } : group)));
        } else {
          setWeekGroups((previous) => previous.map((group) => (group.key === key ? { ...group, trades } : group)));
        }
        return trades;
      } finally {
        setGroupTradesLoading((previous) => ({ ...previous, [cacheKey]: false }));
      }
    },
    [accountIds, currency, marketProfile, range, result, selectedSymbols, side],
  );

  const load = useCallback(
    async (pageOnly = false) => {
      if (accountIds.length === 0) return;
      if ((!range.from || !range.to) && !loaded) {
        setLoading(false);
        return;
      }
      if (pageOnly) setPageLoading(true);
      else setLoading(true);
      setError(false);
      try {
        const params = commonParams(accountIds, range, side, result, currency, marketProfile, selectedSymbols);
        if (view === "day") {
          const groups = await tradeCenterApi.groups({
            ...params,
            view: "day",
            limit: dayVisible + 1,
            offset: 0,
            includeTrades: false,
          });
          const visible = groups.slice(0, dayVisible);
          const first = visible[0];
          const firstTrades = first ? await loadGroupTrades("day", first.key) : [];
          setDayGroups(
            visible.map((group) => ({
              ...toDayGroup(group),
              trades: group.key === first?.key ? firstTrades : [],
            })),
          );
          setDayHasMore(groups.length > dayVisible);
        } else if (view === "week") {
          const groups = await tradeCenterApi.groups({
            ...params,
            view: "week",
            limit: weekVisible + 1,
            offset: 0,
            includeTrades: false,
          });
          const visible = groups.slice(0, weekVisible);
          const first = visible[0];
          const firstTrades = first ? await loadGroupTrades("week", first.key) : [];
          setWeekGroups(
            visible.map((group) => ({
              ...toWeekGroup(group),
              trades: group.key === first?.key ? firstTrades : [],
            })),
          );
          setWeekHasMore(groups.length > weekVisible);
        } else {
          const [pageData, summaryData] = await Promise.all([
            tradeCenterApi.list({ ...params, page, pageSize: ALL_TRADES_PAGE_SIZE, sort, order }),
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
    [
      accountIds,
      currency,
      dayVisible,
      loaded,
      loadGroupTrades,
      marketProfile,
      order,
      page,
      range,
      result,
      selectedSymbols,
      side,
      sort,
      view,
      weekVisible,
    ],
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
    groupTradesLoading,
    loaded,
    loadGroupTrades,
    loading,
    pageLoading,
    pageTotal,
    pageTrades,
    reload: load,
    summary,
    summarySeries,
    symbolOptions,
    weekHasMore,
    weekGroups,
  };
}
