"use client";

import { useCallback, useEffect, useState } from "react";

import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import { accountCenterApi } from "@/lib/tradesync/account-center";
import {
  type TradeAccount,
  type TradeBounds,
  type TradeGroupRecord,
  type TradeOverviewRecord,
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

export function useTradeOverviewData({
  accountIds,
  range,
  side,
  result,
  currency,
  selectedSymbols,
}: {
  accountIds: string[];
  range: { from: string; to: string };
  side: SideFilter;
  result: ResultFilter;
  currency: string;
  selectedSymbols: string[];
}) {
  const [accounts, setAccounts] = useState<TradeAccount[]>([]);
  const [bounds, setBounds] = useState<TradeBounds>({ earliestDay: null, latestDay: null });
  const [symbols, setSymbols] = useState<string[]>([]);
  const [overview, setOverview] = useState<TradeOverviewRecord | null>(null);
  const [loading, setLoading] = useState(true);
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
          isStatistics: account.is_statistics,
          lastUpdatedAt: account.last_updated_at,
        }));
        setAccounts(mapped);

        const ids = mapped.map((account) => account.id);
        if (ids.length === 0 || accountIds.length === 0) {
          setOverview(null);
          return;
        }
        const selected = accountIds;
        const [boundsData, symbolsData] = await Promise.all([
          tradeCenterApi.bounds({ accountIds: selected }),
          tradeCenterApi.symbols(),
        ]);
        setBounds(boundsData);
        setSymbols(symbolsData);
        if (!range.from || !range.to) {
          setOverview(null);
          return;
        }
        const overviewData = await tradeCenterApi.overview(
          commonParams(selected, range, side, result, currency, selectedSymbols),
        );
        setOverview(overviewData);
      } catch {
        if (!background) setError(true);
      } finally {
        if (!background) setLoading(false);
      }
    },
    [accountIds, currency, range, result, selectedSymbols, side],
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
        ...commonParams(accountIds, range, side, result, currency, selectedSymbols),
        view: "day",
        fromDay: day,
        toDay: day,
        limit: 1,
        offset: 0,
      });
      return groups[0] ? toDayGroup(groups[0]) : null;
    },
    [accountIds, currency, range, result, selectedSymbols, side],
  );

  return {
    accounts,
    bounds,
    error,
    loadDayGroup,
    loading,
    overview,
    reload,
    symbols,
  };
}
