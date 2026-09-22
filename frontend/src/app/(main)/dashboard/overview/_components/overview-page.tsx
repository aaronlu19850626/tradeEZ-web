"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Maximize2, Plus, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";

import { CumulativeHistoryDialog } from "@/components/dialogs/cumulative-history-dialog";
import type { ResultFilter, SideFilter } from "@/components/filters/trade-filter-controls";
import { PanelAction, PanelIconAction, PanelMenuTrigger } from "@/components/shared/dashboard-actions";
import { DisplayCurrencyProvider } from "@/components/shared/display-currency-provider";
import { MarketColorProvider } from "@/components/shared/market-color-provider";
import { SyncEmptyState } from "@/components/shared/sync-empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCount } from "@/lib/format-numbers";
import { useLocale } from "@/lib/i18n";
import { resolveMarketProfile } from "@/lib/market-colors";
import { dashboardText } from "@/lib/tradesync/dashboard-i18n";
import type { CompositeScore } from "@/lib/tradesync/trade-score";
import type { DayGroup } from "@/lib/tradesync/trades-mock";

import { useTradeOverviewData } from "../_hooks/use-trade-overview-data";
import type { OverviewStats } from "../_lib/overview-data";
import { OverviewHeader } from "./overview-header";
import { OverviewMetrics } from "./overview-metrics";
import { OverviewToolbar } from "./overview-toolbar";
import {
  buildMonth,
  ConsistencyHeatmap,
  CumulativeChart,
  DailyChart,
  DayTradesDialog,
  DrawdownChart,
  DurationPerformanceChart,
  MonthCalendar,
  Panel,
  RecentTrades,
  ScoreDialog,
  ScoreRadar,
  shiftMonth,
  TimePerformanceChart,
} from "./panels";

const EMPTY_STATS: OverviewStats = {
  count: 0,
  net: 0,
  winners: 0,
  losers: 0,
  breakEven: 0,
  winRate: 0,
  profitFactor: null,
  avgWin: null,
  avgLoss: null,
  winDays: 0,
  flatDays: 0,
  lossDays: 0,
  dayWinRate: 0,
  days: [],
};

const EMPTY_SCORE: CompositeScore = {
  insufficient: true,
  sampleTrades: 0,
  validR: 0,
  total: null,
  dimensions: [],
  weakest: [],
};

const CURRENCY_ORDER = ["USD", "CNY", "EUR", "GBP", "JPY", "HKD"];

export default function DashboardOverviewPage() {
  const locale = useLocale();
  const t = dashboardText[locale];

  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [side, setSide] = useState<SideFilter>("all");
  const [result, setResult] = useState<ResultFilter>("all");
  const [currency, setCurrency] = useState("USD");
  const [marketProfile, setMarketProfile] = useState<"cn" | "fx">("fx");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [timeBasis, setTimeBasis] = useState<"entry" | "exit">("entry");
  const [scoreOpen, setScoreOpen] = useState(false);
  const [cumulativeOpen, setCumulativeOpen] = useState(false);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [dayGroup, setDayGroup] = useState<DayGroup | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filterRefreshing, setFilterRefreshing] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const rangeInitialized = useRef(false);
  const [toolbarStuck, setToolbarStuck] = useState(false);
  const firstFilterRender = useRef(true);
  const currencyUserTouched = useRef(false);

  const { accounts, bounds, error, loading, overview, reload, symbolOptions, loadDayGroup, total } =
    useTradeOverviewData({
      accountIds,
      range,
      side,
      result,
      currency,
      marketProfile,
      selectedSymbols,
    });

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

  const latestDay = bounds.latestDay ?? "";
  const earliestDay = bounds.earliestDay ?? "";

  useEffect(() => {
    if (!rangeInitialized.current && latestDay) {
      setRange({ from: earliestDay, to: latestDay });
      rangeInitialized.current = true;
    }
  }, [earliestDay, latestDay]);

  const filterKey = [
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
    void filterKey;
    if (firstFilterRender.current) {
      firstFilterRender.current = false;
      return;
    }
    setFilterRefreshing(true);
    const timer = window.setTimeout(() => setFilterRefreshing(false), 420);
    return () => window.clearTimeout(timer);
  }, [filterKey]);

  const stats: OverviewStats = overview?.stats ?? EMPTY_STATS;
  const score: CompositeScore = overview?.score ?? EMPTY_SCORE;
  const cumulativeFull = overview?.cumulative ?? [];
  const cumulativeRecent = overview?.cumulativeRecent ?? [];
  const drawdown = overview?.drawdown ?? { points: [], maxDrawdown: 0 };
  const scoreRadar = useMemo(
    () =>
      score.dimensions.map((dimension) => ({
        key: dimension.key,
        score: dimension.score,
      })),
    [score.dimensions],
  );
  const recent = overview?.recent ?? [];

  const monthKey = cursor ?? (latestDay ? latestDay.slice(0, 7) : "");
  const calendar = useMemo(() => buildMonth(monthKey, stats.days), [monthKey, stats.days]);
  const consistency = overview?.consistency ?? { cells: [], weeks: [] };

  const toolbarBusy = loading || filterRefreshing || !overview;
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
      resolveMarketProfile(
        accounts.filter((account) => accountIds.includes(account.id)).map((account) => account.marketProfile),
      ) === "mixed"
        ? (["cn", "fx"] as const)
        : [accounts.find((account) => accountIds.includes(account.id))?.marketProfile ?? "fx"],
    [accounts, accountIds],
  );
  const marketOptionsLocked = marketProfiles.length > 1;

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
      setCurrency(currencies.includes("USD") ? "USD" : currencies[0]);
    }
  }, [currencies, currency]);

  useEffect(() => {
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
  }, [currency, marketProfile, marketProfiles]);

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
  const largeDataLoading = toolbarBusy && total > 10000;

  const refreshData = () => {
    if (loading) return;
    void reload();
  };

  const openCalendarDay = async (day: string) => {
    setCalendarDay(day);
    setDayGroup(null);
    try {
      const group = await loadDayGroup(day);
      setDayGroup(group);
    } catch {
      setDayGroup(null);
    }
  };

  const closeCalendarDay = () => {
    setCalendarDay(null);
    setDayGroup(null);
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
      fetching={loading}
      lastUpdatedAt={lastUpdatedAt}
      onRefresh={refreshData}
      side={side}
      result={result}
      currency={currency}
      currencies={currencies}
      allowCurrencyAll={!currencyOptionsLocked}
      marketProfile={marketProfile}
      marketProfiles={[...marketProfiles]}
      allowMarketAll={!marketOptionsLocked}
      symbolsSelected={selectedSymbols}
      symbolOptions={symbolOptions}
      accounts={accounts}
      accountIds={accountIds}
      dateRange={range}
      latestDay={latestDay}
      earliestDay={earliestDay}
      onSide={setSide}
      onResult={setResult}
      onCurrency={applyCurrency}
      onMarketProfile={setMarketProfile}
      onSymbolsChange={setSelectedSymbols}
      onRange={(from, to) => setRange({ from, to })}
      onAccountsChange={(ids) => setAccountIds(ids.length > 0 ? ids : [...scopeDefaults])}
    />
  );

  if (error) {
    return (
      <DisplayCurrencyProvider currency={currency}>
        <MarketColorProvider profile={marketProfile}>
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
        </MarketColorProvider>
      </DisplayCurrencyProvider>
    );
  }

  const initialLoading = !overview && (loading || accounts.length > 0);

  if (initialLoading) {
    return (
      <DisplayCurrencyProvider currency={currency}>
        <MarketColorProvider profile={marketProfile}>
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
        </MarketColorProvider>
      </DisplayCurrencyProvider>
    );
  }

  const empty = stats.count === 0;

  return (
    <DisplayCurrencyProvider currency={currency}>
      <MarketColorProvider profile={marketProfile}>
        <div className="relative mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
          {header}
          {toolbar}
          {largeDataLoading && (
            <Alert className="pointer-events-none absolute top-3 left-1/2 z-40 w-auto max-w-[90%] -translate-x-1/2 shadow-md">
              <RefreshCw className="size-4 animate-spin" />
              <AlertDescription className="whitespace-nowrap">
                {t.largeDataLoading.replace("{count}", formatCount(total, locale))}
              </AlertDescription>
            </Alert>
          )}
          {empty ? (
            <SyncEmptyState
              title={t.emptyTitle}
              description={t.emptyDescription}
              actionLabel={t.goToAccounts}
              href="/dashboard/account-center"
              actionIcon={<Plus className="size-4" />}
            />
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
                    onOpenDay={openCalendarDay}
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
                  <TimePerformanceChart
                    points={(timeBasis === "entry" ? overview?.timeEntry : overview?.timeExit) ?? []}
                    basis={timeBasis}
                    locale={locale}
                  />
                </Panel>
                <Panel t={t} titleKey="durationTitle" tipKey="durationTip" bodyClassName="justify-center">
                  <DurationPerformanceChart points={overview?.duration ?? []} locale={locale} />
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
          <DayTradesDialog locale={locale} day={calendarDay ? dayGroup : null} onClose={closeCalendarDay} />
        </div>
      </MarketColorProvider>
    </DisplayCurrencyProvider>
  );
}
