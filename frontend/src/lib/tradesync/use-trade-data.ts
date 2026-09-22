"use client";

import { useCallback, useEffect, useState } from "react";

import { accountCenterApi } from "./account-center";
import { type TradeAccount, toTrade, tradeCenterApi } from "./trade-center";
import type { MockTrade } from "./trades-mock";

export interface TradeData {
  accounts: TradeAccount[];
  trades: MockTrade[] | null;
  fetching: boolean;
  fetchError: boolean;
  reload: (background?: boolean) => Promise<void>;
}

/**
 * Loads the user's accounts and every closed trade once, then refreshes in the
 * background whenever the page regains focus. Pages filter/aggregate locally, so
 * changing a filter never needs a request.
 */
export function useTradeData({ includeTrades = true }: { includeTrades?: boolean } = {}): TradeData {
  const [accounts, setAccounts] = useState<TradeAccount[]>([]);
  const [trades, setTrades] = useState<MockTrade[] | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const reload = useCallback(
    async (background = false) => {
      if (!background) {
        setFetching(true);
        setFetchError(false);
      }
      try {
        const accountItems = await accountCenterApi.list();
        const mapped: TradeAccount[] = accountItems.map((account) => ({
          id: String(account.id),
          name: account.name ?? `MT5 ${account.mt5_login}`,
          login: String(account.mt5_login),
          currency: account.currency,
          isStatistics: account.is_statistics,
          tradeCount: account.trade_count,
          lastUpdatedAt: account.last_updated_at,
        }));
        setAccounts(mapped);

        const ids = mapped.map((account) => account.id);
        const collected: MockTrade[] = [];
        let page = 1;
        let total = 0;
        if (includeTrades && ids.length > 0) {
          do {
            const response = await tradeCenterApi.list({ accountIds: ids, page, pageSize: 1000 });
            collected.push(...response.items.map(toTrade));
            total = response.total;
            page += 1;
          } while (collected.length < total && total > 0);
        }
        setTrades(includeTrades ? collected : []);
        setFetchError(false);
      } catch {
        // A background refresh keeps whatever is already on screen.
        if (!background) setFetchError(true);
      } finally {
        if (!background) setFetching(false);
      }
    },
    [includeTrades],
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

  return { accounts, trades, fetching, fetchError, reload };
}
