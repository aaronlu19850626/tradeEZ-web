"use client";

import { useEffect, useMemo, useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  AccountScope,
  AvgWinLossBar,
  BucketChart,
  buildConsistency,
  buildMonth,
  ConsistencyHeatmap,
  CountPills,
  CumulativeChart,
  cumulativePoints,
  DailyChart,
  DrawdownChart,
  drawdownPoints,
  groupByDay,
  MetricCard,
  MonthCalendar,
  money,
  Panel,
  percent,
  RecentTrades,
  ScoreDialog,
  ScoreRadar,
  shiftMonth,
  tone,
} from "@/components/dashboard/overview-panels";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/lib/i18n";
import { dashboardText, fill } from "@/lib/tradesync/dashboard-i18n";
import { type CompositeScore, compositeScore } from "@/lib/tradesync/trade-score";
import { addDays, shanghaiDayKey, shanghaiWeekStart } from "@/lib/tradesync/trades-mock";
import { useTradeData } from "@/lib/tradesync/use-trade-data";

const DURATION_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: "30s", min: 0, max: 60 },
  { key: "1m", min: 60, max: 300 },
  { key: "5m", min: 300, max: 900 },
  { key: "15m", min: 900, max: 1800 },
  { key: "30m", min: 1800, max: 3600 },
  { key: "1h", min: 3600, max: 4 * 3600 },
  { key: "4h", min: 4 * 3600, max: 12 * 3600 },
  { key: "12h", min: 12 * 3600, max: 86_400 },
  { key: "1d", min: 86_400, max: 2 * 86_400 },
  { key: "2d+", min: 2 * 86_400, max: Number.POSITIVE_INFINITY },
];

export default function DashboardOverviewPage() {
  const locale = useLocale();
  const t = dashboardText[locale];
  const { accounts, trades, fetching, fetchError, reload } = useTradeData();

  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [rangePreset, setRangePreset] = useState<string>("all");
  const [scoreOpen, setScoreOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const statisticsAccounts = useMemo(() => accounts.filter((account) => account.isStatistics), [accounts]);
  const scopeDefaults = useMemo(
    () =>
      statisticsAccounts.length > 0
        ? statisticsAccounts.map((account) => account.id)
        : accounts.map((account) => account.id),
    [statisticsAccounts, accounts],
  );

  useEffect(() => {
    if (accountIds.length === 0 && scopeDefaults.length > 0) setAccountIds([...scopeDefaults]);
  }, [accountIds.length, scopeDefaults]);

  const latestDay = useMemo(
    () => (trades?.length ? shanghaiDayKey(Math.max(...trades.map((trade) => trade.closeTime))) : ""),
    [trades],
  );

  const range = useMemo(() => {
    if (!latestDay || rangePreset === "all") return null;
    const startOfWeek = shanghaiWeekStart(Math.floor(new Date(`${latestDay}T00:00:00.000Z`).getTime() / 1000));
    if (rangePreset === "today") return { from: latestDay, to: latestDay };
    if (rangePreset === "week") return { from: startOfWeek, to: latestDay };
    if (rangePreset === "month") return { from: `${latestDay.slice(0, 7)}-01`, to: latestDay };
    if (rangePreset === "last30") return { from: addDays(latestDay, -29), to: latestDay };
    if (rangePreset === "quarter") {
      const month = Number(latestDay.slice(5, 7));
      const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return { from: `${latestDay.slice(0, 4)}-${String(startMonth).padStart(2, "0")}-01`, to: latestDay };
    }
    return { from: `${latestDay.slice(0, 4)}-01-01`, to: latestDay };
  }, [latestDay, rangePreset]);

  const filtered = useMemo(() => {
    const list = trades ?? [];
    return list.filter((trade) => {
      if (!accountIds.includes(trade.accountId)) return false;
      if (!range) return true;
      const day = shanghaiDayKey(trade.closeTime);
      return day >= range.from && day <= range.to;
    });
  }, [trades, accountIds, range]);

  const stats = useMemo(() => {
    const winners = filtered.filter((trade) => trade.netPnl > 0);
    const losers = filtered.filter((trade) => trade.netPnl < 0);
    const winSum = winners.reduce((sum, trade) => sum + trade.netPnl, 0);
    const lossSum = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0));
    const days = groupByDay(filtered);
    return {
      count: filtered.length,
      net: filtered.reduce((sum, trade) => sum + trade.netPnl, 0),
      winners: winners.length,
      losers: losers.length,
      breakEven: filtered.length - winners.length - losers.length,
      winRate: filtered.length ? winners.length / filtered.length : 0,
      profitFactor: lossSum > 0 ? winSum / lossSum : null,
      avgWin: winners.length ? winSum / winners.length : null,
      avgLoss: losers.length ? lossSum / losers.length : null,
      dayWinRate: days.length ? days.filter((day) => day.net > 0).length / days.length : 0,
      days,
    };
  }, [filtered]);

  const score = useMemo<CompositeScore>(() => compositeScore(filtered), [filtered]);
  const cumulative = useMemo(() => cumulativePoints(filtered), [filtered]);
  const drawdown = useMemo(() => drawdownPoints(filtered), [filtered]);
  const scoreRadar = useMemo(
    () =>
      score.dimensions.map((dimension) => ({
        key: dimension.key,
        score: dimension.score,
      })),
    [score.dimensions],
  );
  const recent = useMemo(() => [...filtered].sort((a, b) => b.closeTime - a.closeTime).slice(0, 10), [filtered]);

  const timeBuckets = useMemo(() => {
    const buckets = new Map<number, { key: string; net: number; count: number }>();
    for (const trade of filtered) {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Shanghai",
          hour: "2-digit",
          hour12: false,
        }).format(new Date(trade.closeTime * 1000)),
      );
      const start = Math.floor(hour / 2) * 2;
      const key = `${String(start).padStart(2, "0")}:00`;
      const entry = buckets.get(start) ?? { key, net: 0, count: 0 };
      entry.net += trade.netPnl;
      entry.count += 1;
      buckets.set(start, entry);
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
  }, [filtered]);

  const durationBuckets = useMemo(
    () =>
      DURATION_BUCKETS.map((bucket) => {
        const list = filtered.filter((trade) => trade.durationSec >= bucket.min && trade.durationSec < bucket.max);
        return { key: bucket.key, net: list.reduce((sum, trade) => sum + trade.netPnl, 0), count: list.length };
      }),
    [filtered],
  );

  const monthKey = cursor ?? (latestDay ? latestDay.slice(0, 7) : "");
  const calendar = useMemo(() => buildMonth(monthKey, stats.days), [monthKey, stats.days]);
  const consistency = useMemo(() => buildConsistency(stats.days, latestDay), [stats.days, latestDay]);

  const loading = fetching || trades === null;
  const rangeOptions: { key: string; label: string }[] = [
    { key: "all", label: t.rangeAll },
    { key: "today", label: t.rangeToday },
    { key: "week", label: t.rangeWeek },
    { key: "month", label: t.rangeMonth },
    { key: "last30", label: t.rangeLast30 },
    { key: "quarter", label: t.rangeQuarter },
    { key: "ytd", label: t.rangeYtd },
  ];

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AccountScope
          t={t}
          accounts={statisticsAccounts}
          selected={accountIds}
          onToggle={(id) =>
            setAccountIds((prev) => {
              if (prev.includes(id)) {
                if (prev.length <= 1) return prev;
                return prev.filter((item) => item !== id);
              }
              return [...prev, id];
            })
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5 font-normal">
              <span className="text-muted-foreground">{t.rangeLabel}</span>
              {rangeOptions.find((option) => option.key === rangePreset)?.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {rangeOptions.map((option) => (
              <DropdownMenuItem key={option.key} onSelect={() => setRangePreset(option.key)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );

  if (fetchError) {
    return (
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
        {header}
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
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
      {header}

      {filtered.length === 0 ? (
        <Card className="items-center gap-3 py-16 text-center">
          <CardTitle className="text-base">{t.emptyTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">{t.emptyDescription}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              t={t}
              titleKey="netPnl"
              tipKey="netPnl"
              value={<span className={tone(stats.net)}>{money(stats.net, locale)}</span>}
              sub={
                <span className="text-xs text-muted-foreground">
                  {t.totalTrades} {stats.count}
                </span>
              }
            />
            <MetricCard t={t} titleKey="tradeWin" tipKey="tradeWin" value={percent(stats.winRate * 100, locale)}>
              <CountPills t={t} winners={stats.winners} breakEven={stats.breakEven} losers={stats.losers} />
            </MetricCard>
            <MetricCard
              t={t}
              titleKey="profitFactor"
              tipKey="profitFactor"
              value={stats.profitFactor === null ? t.na : stats.profitFactor.toFixed(2)}
            />
            <MetricCard t={t} titleKey="dayWin" tipKey="dayWin" value={percent(stats.dayWinRate * 100, locale)}>
              <CountPills
                t={t}
                winners={stats.days.filter((day) => day.net > 0).length}
                breakEven={stats.days.filter((day) => day.net === 0).length}
                losers={stats.days.filter((day) => day.net < 0).length}
              />
            </MetricCard>
            <MetricCard
              t={t}
              titleKey="avgWinLoss"
              tipKey="avgWinLoss"
              value={stats.avgWin && stats.avgLoss ? (stats.avgWin / stats.avgLoss).toFixed(2) : t.na}
            >
              <AvgWinLossBar win={stats.avgWin ?? 0} loss={stats.avgLoss ?? 0} locale={locale} />
            </MetricCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <Panel
              t={t}
              titleKey="scoreTitle"
              tipKey="scoreTip"
              action={
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setScoreOpen(true)}>
                  {t.scoreDetail}
                </Button>
              }
            >
              <ScoreRadar t={t} locale={locale} score={score} radar={scoreRadar} />
            </Panel>
            <Panel t={t} titleKey="consistencyTitle" tipKey="consistencyTip">
              <ConsistencyHeatmap t={t} statuses={consistency} />
            </Panel>
            <Panel t={t} titleKey="cumulativeTitle" tipKey="cumulativeTip">
              <CumulativeChart points={cumulative} locale={locale} />
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel t={t} titleKey="dailyTitle" tipKey="dailyTip">
              <DailyChart days={[...stats.days].reverse()} locale={locale} />
            </Panel>
            <Panel
              t={t}
              titleKey="recentTitle"
              tipKey="recentTip"
              action={
                <span className="text-xs text-muted-foreground">{fill(t.recentTip, { count: recent.length })}</span>
              }
            >
              <RecentTrades t={t} trades={recent} locale={locale} />
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel
              t={t}
              titleKey="calendarTitle"
              tipKey="calendarTip"
              action={
                <span className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.prevMonth}
                    onClick={() => setCursor(shiftMonth(monthKey, -1))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCursor(latestDay.slice(0, 7))}
                  >
                    {t.thisMonth}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.nextMonth}
                    onClick={() => setCursor(shiftMonth(monthKey, 1))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </span>
              }
            >
              <MonthCalendar t={t} locale={locale} month={monthKey} calendar={calendar} />
            </Panel>
            <Panel t={t} titleKey="drawdownTitle" tipKey="drawdownTip">
              <DrawdownChart points={drawdown.points} maxDrawdown={drawdown.maxDrawdown} t={t} locale={locale} />
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel t={t} titleKey="timeOfDayTitle" tipKey="timeOfDayTip">
              <BucketChart buckets={timeBuckets} locale={locale} />
            </Panel>
            <Panel t={t} titleKey="durationTitle" tipKey="durationTip">
              <BucketChart buckets={durationBuckets} locale={locale} />
            </Panel>
          </div>
        </>
      )}

      <ScoreDialog t={t} open={scoreOpen} score={score} onClose={() => setScoreOpen(false)} />
    </div>
  );
}
