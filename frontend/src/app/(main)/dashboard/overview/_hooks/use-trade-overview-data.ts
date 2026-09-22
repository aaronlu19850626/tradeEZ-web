"use client";

import { useCallback, useEffect, useState } from "react";

import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import { accountCenterApi } from "@/lib/tradesync/account-center";
import {
  type TradeAccount,
  type TradeBounds,
  type TradeGroupRecord,
  type TradeOverviewRecord,
  type TradeSymbolOption,
  toTrade,
  tradeCenterApi,
} from "@/lib/tradesync/trade-center";
import type { DayGroup } from "@/lib/tradesync/trades-mock";

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

export function useTradeOverviewData({
  accountIds,
  range,
  side,
  result,
  currency,
  marketProfile,
  selectedSymbols,
}: {
  accountIds: string[];
  range: { from: string; to: string };
  side: SideFilter;
  result: ResultFilter;
  currency: string;
  marketProfile: "cn" | "fx";
  selectedSymbols: string[];
}) {
  const [accounts, setAccounts] = useState<TradeAccount[]>([]);
  const [bounds, setBounds] = useState<TradeBounds>({ earliestDay: null, latestDay: null });
  const [symbolOptions, setSymbolOptions] = useState<TradeSymbolOption[]>([]);
  const [overview, setOverview] = useState<TradeOverviewRecord | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError(false);
      try {
        const accountItems = await accountCenterApi.list();
        const mapped: TradeAccount[] = accountItems.map((account) => ({
          id: String(account.id),
          name: account.name ?? `MT5 ${account.mt5_login}`,
          login: String(account.mt5_login),
          currency: account.currency,
          marketProfile: account.market_profile === "cn" ? "cn" : "fx",
          isStatistics: account.is_statistics,
          tradeCount: account.trade_count,
          lastUpdatedAt: account.last_updated_at,
        }));
        setAccounts(mapped);

        const ids = mapped.map((account) => account.id);
        if (ids.length === 0 || accountIds.length === 0) {
          setOverview(null);
          return;
        }
        const selected = accountIds;
        const [boundsData, symbolOptionsData] = await Promise.all([
          tradeCenterApi.bounds({ accountIds: selected }),
          tradeCenterApi.symbolOptions({
            accountIds: selected,
            currency: currency === "all" ? undefined : currency,
            marketProfile,
          }),
        ]);
        setBounds(boundsData);
        setSymbolOptions(symbolOptionsData);
        if ((!range.from || !range.to) && !loaded) {
          setOverview(null);
          setTotal(0);
          return;
        }
        setTotal(0);
        const countData = await tradeCenterApi.list({
          ...commonParams(selected, range, side, result, currency, marketProfile, selectedSymbols),
          page: 1,
          pageSize: 1,
          sort: "closeTime",
          order: "desc",
        });
        setTotal(countData.total);
        const overviewData = await tradeCenterApi.overview(
          commonParams(selected, range, side, result, currency, marketProfile, selectedSymbols),
        );
        setOverview(overviewData);
        setLoaded(true);
      } catch {
        if (!background) setError(true);
      } finally {
        if (!background) setLoading(false);
      }
    },
    [accountIds, currency, loaded, marketProfile, range, result, selectedSymbols, side],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void reload(true);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  const loadDayGroup = useCallback(
    async (day: string): Promise<DayGroup | null> => {
      if (accountIds.length === 0) return null;
      const groups = await tradeCenterApi.groups({
        ...commonParams(accountIds, range, side, result, currency, marketProfile, selectedSymbols),
        view: "day",
        fromDay: day,
        toDay: day,
        limit: 1,
        offset: 0,
      });
      return groups[0] ? toDayGroup(groups[0]) : null;
    },
    [accountIds, currency, marketProfile, range, result, selectedSymbols, side],
  );

  return {
    accounts,
    bounds,
    error,
    loadDayGroup,
    loading,
    overview,
    reload,
    symbolOptions,
    total,
  };
}
