"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale } from "@/lib/i18n";
import { tradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import { addDays, computeStats, dayKeyToEpoch, shanghaiWeekStart } from "@/lib/tradesync/trades-mock";
import { useTradeData } from "@/lib/tradesync/use-trade-data";

import { useTradeCenterServerData } from "../_hooks/use-trade-center-server-data";
import { useTradeColumns } from "../_hooks/use-trade-columns";
import { useTradeFilters } from "../_hooks/use-trade-filters";
import { useTradeViewState } from "../_hooks/use-trade-view-state";
import { DEFAULT_OPTIONAL_BY_VIEW } from "../_lib/trade-center-model";
import {
  AllView,
  ColumnPickerDialog,
  DayGroupCard,
  EmptyPanel,
  ErrorPanel,
  LoadingWave,
  LoadMore,
  NoAccountsPanel,
  SideRail,
  Toolbar,
  WeekGroupCard,
} from "./trade-center-ui";
export default function TradeCenterPage() {
  const locale = useLocale();
  const t = tradeCenterText[locale];
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarStuck, setToolbarStuck] = useState(false);
  const {
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
    setRange,
    setResult,
    setSelectedSymbols,
    setSort,
    setSide,
    setView,
    setWeekVisible,
    side,
    sort,
    tableCommand,
    tableResetVersion,
    toggleAllTables,
    view,
    weekVisible,
  } = useTradeViewState();
  const { accounts, fetching, fetchError, reload: loadData } = useTradeData({ includeTrades: false });
  const { applyColumns, columnOpen, optionalColumns, setColumnOpen, viewColumns } = useTradeColumns(view);

  const serverData = useTradeCenterServerData({
    accountIds,
    currency,
    dayVisible,
    page,
    range,
    result,
    selectedSymbols,
    side,
    sort: sort?.key,
    order: sort?.dir,
    view,
    weekVisible,
  });
  const latestDay = serverData.bounds.latestDay ?? "";
  const earliestDay = serverData.bounds.earliestDay ?? "";
  const defaultAccountIds = useMemo(
    () => accounts.filter((account) => account.isStatistics).map((account) => account.id),
    [accounts],
  );
  // Fall back to every account when none is flagged for statistics, so the page
  // still has something to show instead of an empty scope.
  const scopeDefaults = useMemo(
    () => (defaultAccountIds.length > 0 ? defaultAccountIds : accounts.map((account) => account.id)),
    [defaultAccountIds, accounts],
  );

  // Follow the account module's statistics set: a change resets the page scope,
  // and accounts that no longer exist are dropped.
  const lastScopeKey = useRef<string | null>(null);
  // Set when a deep link carries an account scope; consumed once accounts load.
  const pendingScopeRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (accounts.length === 0) return;
    const statisticsIds = accounts.filter((account) => account.isStatistics).map((account) => account.id);
    const fallback = statisticsIds.length > 0 ? statisticsIds : accounts.map((account) => account.id);
    const key = fallback.join(",");
    const pending = pendingScopeRef.current;
    if (pending !== null) {
      pendingScopeRef.current = null;
      lastScopeKey.current = key;
      const alive = pending.filter((id) => accounts.some((account) => account.id === id));
      setAccountIds(alive.length > 0 ? alive : [...fallback]);
      return;
    }
    const statisticsChanged = key !== lastScopeKey.current;
    lastScopeKey.current = key;
    setAccountIds((prev) => {
      const alive = prev.filter((id) => accounts.some((account) => account.id === id));
      if (statisticsChanged || alive.length === 0) return [...fallback];
      return alive.length === prev.length ? prev : alive;
    });
  }, [accounts, setAccountIds]);

  const scopeIsDefault =
    accountIds.length === scopeDefaults.length && scopeDefaults.every((id) => accountIds.includes(id));

  // Deep links: view, filters, date range, account scope and page mirror into the
  // URL so a refresh or a shared link restores the same screen.
  const applyUrlState = useCallback(
    (params: URLSearchParams) => {
      const nextView = params.get("view");
      if (nextView === "day" || nextView === "week" || nextView === "all") setView(nextView);
      const from = params.get("from");
      const to = params.get("to");
      if (from && to) setRange({ from, to });
      const nextSide = params.get("side");
      if (nextSide === "all" || nextSide === "buy" || nextSide === "sell") setSide(nextSide);
      const nextResult = params.get("result");
      if (nextResult === "all" || nextResult === "win" || nextResult === "loss") setResult(nextResult);
      const nextCurrency = params.get("currency");
      if (nextCurrency) setCurrency(nextCurrency);
      const nextSymbol = params.get("symbol");
      if (nextSymbol) setSelectedSymbols(nextSymbol.split(",").filter(Boolean));
      const nextPage = Number(params.get("page"));
      if (Number.isInteger(nextPage) && nextPage > 0) setPage(nextPage);
      const accountsParam = params.get("accounts");
      if (accountsParam) {
        const ids = accountsParam.split(",").filter(Boolean);
        const known = accounts.filter((account) => ids.includes(account.id)).map((account) => account.id);
        if (known.length > 0) setAccountIds(known);
        else pendingScopeRef.current = ids;
      }
    },
    [accounts, setAccountIds, setCurrency, setPage, setRange, setResult, setSelectedSymbols, setSide, setView],
  );
  const applyUrlRef = useRef(applyUrlState);
  applyUrlRef.current = applyUrlState;

  const [urlSynced, setUrlSynced] = useState(false);
  useEffect(() => {
    applyUrlRef.current(new URLSearchParams(window.location.search));
    setUrlSynced(true);
    const onPop = () => applyUrlRef.current(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!urlSynced) return;
    const params = new URLSearchParams();
    if (view !== "day") params.set("view", view);
    // Only pin a range when it differs from the full synced span.
    if (range.from && range.to && (range.from !== earliestDay || range.to !== latestDay)) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    if (side !== "all") params.set("side", side);
    if (result !== "all") params.set("result", result);
    if (currency !== "all") params.set("currency", currency);
    if (selectedSymbols.length > 0) params.set("symbol", selectedSymbols.join(","));
    if (!scopeIsDefault && accountIds.length > 0) params.set("accounts", accountIds.join(","));
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [
    urlSynced,
    view,
    range.from,
    range.to,
    side,
    result,
    currency,
    selectedSymbols,
    accountIds,
    page,
    earliestDay,
    latestDay,
    scopeIsDefault,
  ]);

  // Default the range to the full synced span once trades arrive.
  useEffect(() => {
    if (latestDay && earliestDay && range.from === "") {
      setRange({ from: earliestDay, to: latestDay });
    }
  }, [earliestDay, latestDay, range.from, setRange]);

  const { applyCurrency, currencies, currencyOptionsLocked } = useTradeFilters({
    accounts,
    accountIds,
    currency,
    fetching,
    range,
    result,
    selectedSymbols,
    setCurrency,
    side,
    trades: null,
  });
  const symbols = serverData.symbols;
  const dayGroups = view === "day" ? serverData.dayGroups : [];
  const weekGroups = view === "week" ? serverData.weekGroups : [];

  // The divider only shows once the bar has actually pinned to the top.
  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const scroller = element.closest<HTMLElement>('[data-slot="dashboard-workspace"]');
    let frame = 0;
    const measure = () => {
      frame = 0;
      const barBox = element.getBoundingClientRect();
      const barTop = barBox.top;
      const containerTop = scroller ? scroller.getBoundingClientRect().top : 0;
      setToolbarStuck(barTop <= containerTop + 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const target: EventTarget = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Avoid flashing the no-accounts or empty panel while the initial account
  // scope is still being resolved.
  const scopePending = accounts.length > 0 && accountIds.length === 0;
  const loading = serverData.loading || fetching || scopePending || (accountIds.length > 0 && !serverData.loaded);
  const hasError = fetchError || serverData.error;
  let body: ReactNode;
  if (hasError) {
    body = <ErrorPanel t={t} onRetry={() => void loadData()} />;
  } else if (loading) {
    body = <LoadingWave t={t} />;
  } else if (accountIds.length === 0) {
    body = <NoAccountsPanel t={t} />;
  } else if (view === "all") {
    body =
      serverData.pageTotal === 0 ? (
        <EmptyPanel t={t} />
      ) : (
        <AllView
          t={t}
          locale={locale}
          trades={serverData.pageTrades}
          stats={serverData.summary ?? computeStats([])}
          total={serverData.pageTotal}
          series={serverData.summarySeries}
          columns={viewColumns}
          page={page}
          onPage={setPage}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          loading={serverData.pageLoading}
        />
      );
  } else if (view === "day" && dayGroups.length === 0) {
    body = <EmptyPanel t={t} />;
  } else if (view === "week" && weekGroups.length === 0) {
    body = <EmptyPanel t={t} />;
  } else if (view === "day") {
    body = (
      <>
        {dayGroups.slice(0, dayVisible).map((group, index) => (
          <DayGroupCard
            key={`${group.key}-${tableResetVersion}`}
            group={group}
            columns={viewColumns}
            t={t}
            locale={locale}
            tableCommand={tableCommand}
            defaultTableOpen={index === 0}
          />
        ))}
        {serverData.dayHasMore && <LoadMore label={t.loadMore} onClick={() => setDayVisible((prev) => prev + 8)} />}
      </>
    );
  } else {
    body = (
      <>
        {weekGroups.slice(0, weekVisible).map((group, index) => (
          <WeekGroupCard
            key={`${group.key}-${tableResetVersion}`}
            group={group}
            columns={viewColumns}
            t={t}
            locale={locale}
            tableCommand={tableCommand}
            defaultTableOpen={index === 0}
          />
        ))}
        {serverData.weekHasMore && <LoadMore label={t.loadMore} onClick={() => setWeekVisible((prev) => prev + 6)} />}
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
      <header>
        <h1 className="font-semibold text-3xl tracking-tight">{t.title}</h1>
      </header>

      {/* The view switch and filters stay pinned while the groups scroll. Negative
          margins let the bar bleed to the workspace edge so nothing peeks around it. */}
      <div
        ref={toolbarRef}
        className={`sticky -top-4 z-30 -mx-4 bg-background px-4 py-3 md:-top-6 md:-mx-6 md:px-6 lg:-mx-10 lg:px-10 xl:-mx-12 xl:px-12 ${
          toolbarStuck ? "border-border/60 border-b" : ""
        }`}
      >
        <div
          aria-busy={loading}
          inert={loading ? true : undefined}
          className={loading ? "pointer-events-none opacity-70 transition-opacity" : "transition-opacity"}
        >
          <Toolbar
            t={t}
            view={view}
            onView={(next) => {
              setView(next);
              resetPage();
            }}
            range={range}
            onRange={applyRange}
            latestDay={latestDay}
            earliestDay={earliestDay}
            side={side}
            onSide={(next) => {
              setSide(next);
              resetPage();
            }}
            result={result}
            onResult={(next) => {
              setResult(next);
              resetPage();
            }}
            currency={currency}
            currencies={currencies}
            allowCurrencyAll={!currencyOptionsLocked}
            onCurrency={(next) => {
              applyCurrency(next);
              resetPage();
            }}
            symbolsSelected={selectedSymbols}
            symbolOptions={symbols}
            onSymbolsChange={(next) => {
              setSelectedSymbols(next);
              resetPage();
            }}
            onOpenColumns={() => setColumnOpen(true)}
            tablesExpanded={tableCommand.value}
            onToggleAllTables={toggleAllTables}
            accounts={accounts}
            selectedAccountIds={accountIds}
            onAccountsChange={(ids) => {
              setAccountIds(ids.length > 0 ? ids : [...scopeDefaults]);
              resetPage();
            }}
          />
        </div>
      </div>

      {/* The All view drops the calendar rail so the table can use the full width. */}
      <div
        className={
          view === "all"
            ? "flex min-h-0 min-w-0 flex-col gap-4"
            : "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">{body}</div>
        {view !== "all" && range.from !== "" && (
          <SideRail
            t={t}
            locale={locale}
            range={range}
            query={{
              accountIds,
              fromDay: range.from || undefined,
              toDay: range.to || undefined,
              side,
              result,
              currency: currency === "all" ? undefined : currency,
              symbol: selectedSymbols.length === 1 ? selectedSymbols[0] : undefined,
            }}
            view={view}
            onPickDay={(dayKey) => {
              if (view === "week") {
                const start = shanghaiWeekStart(dayKeyToEpoch(dayKey));
                setRange({ from: start, to: addDays(start, 6) });
              } else {
                setRange({ from: dayKey, to: dayKey });
                setView("day");
              }
              resetPage();
            }}
          />
        )}
      </div>

      <ColumnPickerDialog
        t={t}
        open={columnOpen}
        columns={optionalColumns}
        defaultColumns={DEFAULT_OPTIONAL_BY_VIEW[view]}
        onOpenChange={setColumnOpen}
        onApply={applyColumns}
      />
    </div>
  );
}
