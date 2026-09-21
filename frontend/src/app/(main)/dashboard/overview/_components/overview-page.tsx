"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Maximize2, Settings } from "lucide-react";
import { toast } from "sonner";

import { CumulativeHistoryDialog } from "@/components/dialogs/cumulative-history-dialog";
import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import { PanelAction, PanelIconAction, PanelMenuTrigger } from "@/components/shared/dashboard-actions";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/lib/i18n";
import { dashboardText } from "@/lib/tradesync/dashboard-i18n";
import { type CompositeScore, compositeScore } from "@/lib/tradesync/trade-score";
import { addDays, shanghaiDayKey } from "@/lib/tradesync/trades-mock";
import { useTradeData } from "@/lib/tradesync/use-trade-data";

import {
  buildOverviewStats,
  cumulativePoints,
  drawdownPoints,
  groupByDay,
  money,
  percent,
  tone,
} from "../_lib/overview-data";
import { OverviewHeader } from "./overview-header";
import { OverviewMetrics } from "./overview-metrics";
import { OverviewToolbar } from "./overview-toolbar";
import {
  AvgWinLossBar,
  buildConsistency,
  buildMonth,
  ConsistencyHeatmap,
  CountPills,
  CumulativeChart,
  DailyChart,
  DayTradesDialog,
  DrawdownChart,
  DurationPerformanceChart,
  MetricTile,
  MonthCalendar,
  Panel,
  RecentTrades,
  ScoreDialog,
  ScoreRadar,
  SemiGauge,
  ShareRing,
  shiftMonth,
  TimePerformanceChart,
} from "./panels";

export default function DashboardOverviewPage() {
  const locale = useLocale();
  const t = dashboardText[locale];
  const { accounts, trades, fetching, fetchError, reload } = useTradeData();

  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [side, setSide] = useState<SideFilter>("all");
  const [result, setResult] = useState<ResultFilter>("all");
  const [currency, setCurrency] = useState("USD");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [timeBasis, setTimeBasis] = useState<"entry" | "exit">("entry");
  const [scoreOpen, setScoreOpen] = useState(false);
  const [cumulativeOpen, setCumulativeOpen] = useState(false);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filterRefreshing, setFilterRefreshing] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarStuck, setToolbarStuck] = useState(false);
  const firstFilterRender = useRef(true);
  const currencyUserTouched = useRef(false);

  const statisticsAccounts = useMemo(() => accounts.filter((account) => account.isStatistics), [accounts]);
  const scopeDefaults = useMemo(
    () =>
      statisticsAccounts.length > 0
        ? statisticsAccounts.map((account) => account.id)
        : accounts.map((account) => account.id),
    [statisticsAccounts, accounts],
  );

  const lastScopeKey = useRef<string | null>(null);
  useEffect(() => {
    if (accounts.length === 0) return;
    const scopeKey = scopeDefaults.join(",");
    if (scopeKey === lastScopeKey.current) return;
    lastScopeKey.current = scopeKey;
    setAccountIds([...scopeDefaults]);
  }, [accounts, scopeDefaults]);

  const latestDay = useMemo(
    () => (trades?.length ? shanghaiDayKey(Math.max(...trades.map((trade) => trade.closeTime))) : ""),
    [trades],
  );
  const earliestDay = useMemo(
    () => (trades?.length ? shanghaiDayKey(Math.min(...trades.map((trade) => trade.closeTime))) : ""),
    [trades],
  );

  useEffect(() => {
    if (trades?.length && range.from === "") setRange({ from: earliestDay, to: latestDay });
  }, [trades, earliestDay, latestDay, range.from]);

  const filtered = useMemo(() => {
    const list = trades ?? [];
    return list.filter((trade) => {
      if (!accountIds.includes(trade.accountId)) return false;
      const day = shanghaiDayKey(trade.closeTime);
      if (range.from && (day < range.from || day > range.to)) return false;
      if (side !== "all" && trade.side !== side) return false;
      if (result === "win" && trade.netPnl <= 0) return false;
      if (result === "loss" && trade.netPnl >= 0) return false;
      if (currency !== "all" && trade.currency !== currency) return false;
      if (selectedSymbols.length > 0 && !selectedSymbols.includes(trade.symbol)) return false;
      return true;
    });
  }, [trades, accountIds, range, side, result, currency, selectedSymbols]);

  const filterKey = [
    accountIds.join(","),
    range.from,
    range.to,
    side,
    result,
    currency,
    selectedSymbols.join(","),
  ].join("|");
  useEffect(() => {
    void filterKey;
    if (firstFilterRender.current) {
      firstFilterRender.current = false;
      return;
    }
    setFilterRefreshing(true);
    const timer = window.setTimeout(() => setFilterRefreshing(false), 420);
    return () => window.clearTimeout(timer);
  }, [filterKey]);

  const stats = useMemo(() => buildOverviewStats(filtered), [filtered]);

  const score = useMemo<CompositeScore>(() => compositeScore(filtered), [filtered]);
  const cumulativeFull = useMemo(() => cumulativePoints(filtered), [filtered]);
  const cumulativeLatestDay = useMemo(
    () => (filtered.length > 0 ? shanghaiDayKey(Math.max(...filtered.map((trade) => trade.closeTime))) : ""),
    [filtered],
  );
  const cumulativeRecent = useMemo(() => {
    if (!cumulativeLatestDay) return [];
    const fromDay = addDays(cumulativeLatestDay, -29);
    return cumulativePoints(filtered.filter((trade) => shanghaiDayKey(trade.closeTime) >= fromDay));
  }, [filtered, cumulativeLatestDay]);
  const drawdown = useMemo(() => drawdownPoints(filtered), [filtered]);
  const scoreRadar = useMemo(
    () =>
      score.dimensions.map((dimension) => ({
        key: dimension.key,
        score: dimension.score,
      })),
    [score.dimensions],
  );
  const recent = useMemo(() => [...filtered].sort((a, b) => b.closeTime - a.closeTime).slice(0, 8), [filtered]);

  const monthKey = cursor ?? (latestDay ? latestDay.slice(0, 7) : "");
  const calendar = useMemo(() => buildMonth(monthKey, stats.days), [monthKey, stats.days]);
  const consistency = useMemo(() => buildConsistency(stats.days, latestDay), [stats.days, latestDay]);

  const loading = fetching || trades === null;
  const toolbarBusy = loading || filterRefreshing;
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
  }, [currencies, tradedCurrencies, currency]);

  const applyCurrency = (value: string) => {
    currencyUserTouched.current = true;
    setCurrency(value);
  };
  const lastUpdatedAt = useMemo(() => {
    const values = accounts
      .filter((account) => accountIds.includes(account.id))
      .map((account) => account.lastUpdatedAt)
      .filter((value): value is number => value !== null);
    return values.length > 0 ? Math.max(...values) : null;
  }, [accounts, accountIds]);

  const refreshData = () => {
    if (fetching) return;
    // Manual refresh reloads accounts and all trades; filters stay as they are.
    void reload();
  };

  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const scroller = element.closest<HTMLElement>('[data-slot="dashboard-workspace"]');
    let frame = 0;
    const measure = () => {
      frame = 0;
      const barTop = element.getBoundingClientRect().top;
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

  const header = <OverviewHeader t={t} />;

  const toolbar = (
    <OverviewToolbar
      t={t}
      locale={locale}
      toolbarRef={toolbarRef}
      toolbarStuck={toolbarStuck}
      busy={toolbarBusy}
      fetching={fetching}
      lastUpdatedAt={lastUpdatedAt}
      onRefresh={refreshData}
      side={side}
      result={result}
      currency={currency}
      currencies={currencies}
      allowCurrencyAll={!currencyOptionsLocked}
      symbolsSelected={selectedSymbols}
      symbolOptions={symbols}
      accounts={accounts}
      accountIds={accountIds}
      dateRange={range}
      latestDay={latestDay}
      earliestDay={earliestDay}
      onSide={setSide}
      onResult={setResult}
      onCurrency={applyCurrency}
      onSymbolsChange={setSelectedSymbols}
      onRange={(from, to) => setRange({ from, to })}
      onToggleAccount={(id) =>
        setAccountIds((prev) => {
          if (prev.includes(id)) {
            if (prev.length <= 1) return prev;
            return prev.filter((item) => item !== id);
          }
          return [...prev, id];
        })
      }
      onSelectAll={() => setAccountIds([...scopeDefaults])}
    />
  );

  if (fetchError) {
    return (
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
        {header}
        {toolbar}
        <Card className="items-center gap-3 py-16 text-center">
          <CardTitle className="text-base">{t.errorTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">{t.errorDescription}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            {t.errorRetry}
          </Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
        {header}
        {toolbar}
        <div className="flex flex-col items-center justify-center gap-6 py-24">
          <div className="flex h-16 items-center gap-2" aria-hidden>
            {[0, 1, 2, 3, 4].map((index) => (
              <span
                key={index}
                className="tradeez-loading-bar h-16 w-3 rounded-full bg-primary"
                style={{ animationDelay: `${(-index * 1.45) / 5}s` }}
              />
            ))}
          </div>
          <div className="text-center">
            <p className="font-semibold text-xl">{t.loadingTitle}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{t.loadingDescription}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
      {header}
      {toolbar}
      {filtered.length === 0 ? (
        <Card className="items-center gap-3 py-16 text-center">
          <CardTitle className="text-base">{t.emptyTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">{t.emptyDescription}</p>
        </Card>
      ) : (
        <>
          <OverviewMetrics t={t} locale={locale} stats={stats} />

          <div className="grid gap-3 xl:grid-cols-3">
            <Panel
              t={t}
              titleKey="scoreTitle"
              tipKey="scoreTip"
              action={<PanelAction onClick={() => setScoreOpen(true)}>{t.scoreDetail}</PanelAction>}
            >
              <ScoreRadar t={t} locale={locale} score={score} radar={scoreRadar} />
            </Panel>
            <Panel
              t={t}
              titleKey="consistencyTitle"
              tipKey="consistencyTip"
              action={<PanelAction href="/dashboard/trade-center">{t.viewMore}</PanelAction>}
            >
              <ConsistencyHeatmap
                t={t}
                locale={locale}
                statuses={consistency}
                onOpenChecklist={() => toast(t.checklistUnavailable)}
              />
            </Panel>
            <Panel
              t={t}
              titleKey="cumulativeTitle"
              tipKey="cumulativeTip"
              action={
                <PanelIconAction label={t.expandCumulative} onClick={() => setCumulativeOpen(true)}>
                  <Maximize2 className="size-4" />
                </PanelIconAction>
              }
            >
              <CumulativeChart points={cumulativeRecent} locale={locale} heightClassName="h-[310px] min-h-0" />
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <Panel
              t={t}
              titleKey="dailyTitle"
              tipKey="dailyTip"
              className="relative z-20 overflow-visible!"
              bodyClassName="relative z-20 justify-center overflow-visible"
            >
              <DailyChart days={[...stats.days].reverse()} locale={locale} />
            </Panel>
            <Panel t={t} titleKey="recentTitle" tipKey="recentTip" bodyClassName="min-h-0 overflow-hidden">
              <RecentTrades t={t} trades={recent} locale={locale} />
            </Panel>
            <Panel t={t} titleKey="drawdownTitle" tipKey="drawdownTip" bodyClassName="justify-center">
              <DrawdownChart points={drawdown.points} locale={locale} />
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-rows-[440px_440px]">
            <Panel
              t={t}
              titleKey="calendarTitle"
              tipKey="calendarTip"
              className="h-auto xl:row-span-2 xl:h-full"
              bodyClassName="min-h-0 overflow-hidden"
            >
              <MonthCalendar
                t={t}
                locale={locale}
                month={monthKey}
                calendar={calendar}
                onShiftMonth={(delta) => setCursor(shiftMonth(monthKey, delta))}
                onThisMonth={() => setCursor(latestDay.slice(0, 7))}
                onOpenDay={setCalendarDay}
              />
            </Panel>
            <Panel
              t={t}
              titleKey="timeOfDayTitle"
              tipKey={timeBasis === "entry" ? "timeOfDayTipEntry" : "timeOfDayTipExit"}
              bodyClassName="justify-center"
              action={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PanelMenuTrigger label={t.timeOfDaySettings}>
                      <Settings className="size-4" />
                    </PanelMenuTrigger>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 p-1.5">
                    <DropdownMenuItem
                      className={`cursor-pointer py-2 ${timeBasis === "entry" ? "font-semibold" : ""}`}
                      onSelect={() => setTimeBasis("entry")}
                    >
                      {t.entryTime}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={`cursor-pointer py-2 ${timeBasis === "exit" ? "font-semibold" : ""}`}
                      onSelect={() => setTimeBasis("exit")}
                    >
                      {t.exitTime}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            >
              <TimePerformanceChart trades={filtered} basis={timeBasis} locale={locale} />
            </Panel>
            <Panel t={t} titleKey="durationTitle" tipKey="durationTip" bodyClassName="justify-center">
              <DurationPerformanceChart trades={filtered} locale={locale} />
            </Panel>
          </div>
        </>
      )}

      <ScoreDialog t={t} open={scoreOpen} score={score} onClose={() => setScoreOpen(false)} />
      <CumulativeHistoryDialog
        open={cumulativeOpen}
        onOpenChange={setCumulativeOpen}
        points={cumulativeFull}
        title={t.cumulativeTitle}
        description={t.cumulativeHistoryDescription}
        loadingText={t.cumulativeHistoryLoading}
        locale={locale}
      />
      <DayTradesDialog locale={locale} day={calendarDay} trades={filtered} onClose={() => setCalendarDay(null)} />
    </div>
  );
}
