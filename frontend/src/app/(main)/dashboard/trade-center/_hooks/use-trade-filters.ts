"use client";

import { useEffect, useMemo, useState } from "react";

import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import type { MarketProfile, TradeAccount } from "@/lib/tradesync/trade-center";
import type { MockTrade } from "@/lib/tradesync/trades-mock";

import { inRange, matchResult, matchSide } from "../_lib/trade-center-model";

const CURRENCY_ORDER = ["USD", "CNY", "EUR", "GBP", "JPY", "HKD"];

export function useTradeFilters({
  accounts,
  accountIds,
  currency,
  marketProfile,
  fetching,
  range,
  result,
  selectedSymbols,
  setCurrency,
  setMarketProfile,
  side,
  trades,
}: {
  accounts: TradeAccount[];
  accountIds: string[];
  currency: string;
  marketProfile: MarketProfile;
  fetching: boolean;
  range: { from: string; to: string };
  result: ResultFilter;
  selectedSymbols: string[];
  setCurrency: (currency: string) => void;
  setMarketProfile: (marketProfile: MarketProfile) => void;
  side: SideFilter;
  trades: MockTrade[] | null;
}) {
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

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
      ].sort((left, right) => {
        const leftIndex = CURRENCY_ORDER.indexOf(left);
        const rightIndex = CURRENCY_ORDER.indexOf(right);
        return (
          (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
        );
      }),
    [accounts, accountIds],
  );
  const currencyOptionsLocked = currencies.length > 1;
  const marketProfiles = useMemo(
    () =>
      [
        ...new Set(
          accounts.filter((account) => accountIds.includes(account.id)).map((account) => account.marketProfile),
        ),
      ].sort((left, right) => (left === right ? 0 : left === "fx" ? -1 : 1)) as MarketProfile[],
    [accounts, accountIds],
  );
  const marketOptionsLocked = marketProfiles.length > 1;
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
    if (currency === "all" || !currencies.includes(currency)) {
      setCurrency(tradedCurrencies.includes("USD") ? "USD" : (tradedCurrencies[0] ?? currencies[0]));
    }
  }, [currencies, tradedCurrencies, currency, setCurrency]);

  useEffect(() => {
    if (marketProfiles.length === 0) return;
    if (currency === "CNY" && marketProfiles.includes("cn")) {
      if (marketProfile !== "cn") setMarketProfile("cn");
      return;
    }
    if (currency === "USD" && marketProfiles.includes("fx")) {
      if (marketProfile !== "fx") setMarketProfile("fx");
      return;
    }
    if (!marketProfiles.includes(marketProfile)) {
      setMarketProfile(marketProfiles[0]);
    }
  }, [currency, marketProfile, marketProfiles, setMarketProfile]);

  const queryKey = [
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
    const delay = loadedKey === null ? 700 : 420;
    const timer = setTimeout(() => setLoadedKey(queryKey), delay);
    return () => clearTimeout(timer);
  }, [queryKey, loadedKey]);

  const applyCurrency = (next: string) => {
    setCurrency(next);
  };

  return {
    applyCurrency,
    currencies,
    currencyOptionsLocked,
    filtered,
    loading: fetching || trades === null || loadedKey !== queryKey,
    marketOptionsLocked,
    marketProfiles,
    symbols,
  };
}
