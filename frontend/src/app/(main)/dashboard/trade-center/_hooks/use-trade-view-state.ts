"use client";

import { useState } from "react";

import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";

import { type ColumnKey, type ViewMode } from "../_lib/trade-center-model";

export function useTradeViewState() {
  const [view, setView] = useState<ViewMode>("day");
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [side, setSide] = useState<SideFilter>("all");
  const [result, setResult] = useState<ResultFilter>("all");
  const [currency, setCurrency] = useState("USD");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [dayVisible, setDayVisible] = useState(8);
  const [weekVisible, setWeekVisible] = useState(6);
  const [tableResetVersion, setTableResetVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: ColumnKey; dir: "asc" | "desc" } | null>(null);
  const [tableCommand, setTableCommand] = useState({ value: false, version: 0 });

  const resetPage = () => {
    setDayVisible(8);
    setWeekVisible(6);
    setPage(1);
    setTableResetVersion((current) => current + 1);
    setTableCommand({ value: false, version: 0 });
  };

  const applyRange = (from: string, to: string) => {
    setRange({ from, to });
    resetPage();
  };

  const toggleAccount = (accountId: string) => {
    setAccountIds((prev) => {
      if (prev.includes(accountId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== accountId);
      }
      return [...prev, accountId];
    });
    resetPage();
  };

  const toggleAllTables = () => {
    setTableCommand((current) => ({ value: !current.value, version: current.version + 1 }));
  };

  return {
    accountIds,
    applyRange,
    currency,
    dayVisible,
    page,
    range,
    resetPage,
    result,
    selectedSymbols,
    setAccountIds,
    setCurrency,
    setDayVisible,
    setPage,
    setSort,
    setRange,
    setResult,
    setSelectedSymbols,
    setSide,
    setTableResetVersion,
    setView,
    setWeekVisible,
    side,
    sort,
    tableCommand,
    tableResetVersion,
    toggleAccount,
    toggleAllTables,
    view,
    weekVisible,
  };
}
