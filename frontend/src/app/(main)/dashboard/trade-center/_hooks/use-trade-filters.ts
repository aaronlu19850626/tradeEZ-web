"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import type { TradeAccount } from "@/lib/tradesync/trade-center";
import type { MockTrade } from "@/lib/tradesync/trades-mock";

import { inRange, matchResult, matchSide } from "../_lib/trade-center-model";

export function useTradeFilters({
  accounts,
  accountIds,
  currency,
  fetching,
  range,
  result,
  selectedSymbols,
  setCurrency,
  side,
  trades,
}: {
  accounts: TradeAccount[];
  accountIds: string[];
  currency: string;
  fetching: boolean;
  range: { from: string; to: string };
  result: ResultFilter;
  selectedSymbols: string[];
  setCurrency: (currency: string) => void;
  side: SideFilter;
  trades: MockTrade[] | null;
}) {
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const currencyUserTouched = useRef(false);

  const filtered = useMemo(
    () =>
      (trades ?? []).filter(
        (trade) =>
          accountIds.includes(trade.accountId) &&
          (range.from === "" || inRange(trade, range.from, range.to)) &&
          matchSide(trade, side) &&
          matchResult(trade, result) &&
          (currency === "all" || trade.currency === currency) &&
          (selectedSymbols.length === 0 || selectedSymbols.includes(trade.symbol)),
      ),
    [trades, accountIds, range, side, result, currency, selectedSymbols],
  );

  const symbols = useMemo(() => [...new Set((trades ?? []).map((trade) => trade.symbol))].sort(), [trades]);
  const currencies = useMemo(
    () =>
      [
        ...new Set(
          accounts
            .filter((account) => accountIds.includes(account.id))
            .map((account) => account.currency)
            .filter(Boolean) as string[],
        ),
      ].sort(),
    [accounts, accountIds],
  );
  const currencyOptionsLocked = currencies.length > 1;
  const tradedCurrencies = useMemo(
    () =>
      [
        ...new Set(
          (trades ?? [])
            .filter((trade) => accountIds.includes(trade.accountId))
            .map((trade) => trade.currency)
            .filter(Boolean) as string[],
        ),
      ].sort(),
    [trades, accountIds],
  );

  useEffect(() => {
    if (currencies.length === 0) {
      if (currency !== "all") setCurrency("all");
      return;
    }
    if (!currencyUserTouched.current && currency === "CNY" && currencies.includes("USD")) {
      setCurrency("USD");
      return;
    }
    if (currency === "all" || !currencies.includes(currency)) {
      setCurrency(tradedCurrencies.includes("USD") ? "USD" : (tradedCurrencies[0] ?? currencies[0]));
    }
  }, [currencies, tradedCurrencies, currency, setCurrency]);

  const queryKey = [accountIds.join(","), range.from, range.to, side, result, currency, selectedSymbols.join(",")].join(
    "|",
  );

  useEffect(() => {
    const delay = loadedKey === null ? 700 : 420;
    const timer = setTimeout(() => setLoadedKey(queryKey), delay);
    return () => clearTimeout(timer);
  }, [queryKey, loadedKey]);

  const applyCurrency = (next: string) => {
    currencyUserTouched.current = true;
    setCurrency(next);
  };

  return {
    applyCurrency,
    currencies,
    currencyOptionsLocked,
    filtered,
    loading: fetching || trades === null || loadedKey !== queryKey,
    symbols,
  };
}
