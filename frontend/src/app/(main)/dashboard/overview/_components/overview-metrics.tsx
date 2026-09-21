"use client";

import type { Locale } from "@/lib/i18n";
import type { DashboardText } from "@/lib/tradesync/dashboard-i18n";

import type { OverviewStats } from "../_lib/overview-data";
import { money, percent, tone } from "../_lib/overview-data";
import { AvgWinLossBar, CountPills, MetricTile, SemiGauge, ShareRing } from "./panels";

const DASH = "--";

export function OverviewMetrics({ t, locale, stats }: { t: DashboardText; locale: Locale; stats: OverviewStats }) {
  return (
    <div data-slot="metric-strip" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricTile
        t={t}
        titleKey="netPnl"
        tipKey="netPnlTip"
        badge={stats.count}
        value={<span className={tone(stats.net)}>{money(stats.net, locale)}</span>}
      />
      <MetricTile
        t={t}
        titleKey="tradeWin"
        tipKey="tradeWinTip"
        value={percent(stats.winRate * 100, locale)}
        visual={
          <div className="flex w-[104px] flex-col items-center gap-1">
            <SemiGauge ratio={stats.winRate} />
            <CountPills t={t} winners={stats.winners} breakEven={stats.breakEven} losers={stats.losers} />
          </div>
        }
      />
      <MetricTile
        t={t}
        titleKey="profitFactor"
        tipKey="profitFactorTip"
        value={stats.profitFactor === null ? DASH : stats.profitFactor.toFixed(2)}
        visual={<ShareRing ratio={stats.profitFactor === null ? 1 : stats.profitFactor / (1 + stats.profitFactor)} />}
      />
      <MetricTile
        t={t}
        titleKey="dayWin"
        tipKey="dayWinTip"
        value={percent(stats.dayWinRate * 100, locale)}
        visual={
          <div className="flex w-[104px] flex-col items-center gap-1">
            <SemiGauge ratio={stats.dayWinRate} />
            <CountPills t={t} winners={stats.winDays} breakEven={stats.flatDays} losers={stats.lossDays} />
          </div>
        }
      />
      <MetricTile
        t={t}
        titleKey="avgWinLoss"
        tipKey="avgWinLossTip"
        value={stats.avgWin && stats.avgLoss ? (stats.avgWin / stats.avgLoss).toFixed(2) : DASH}
        visual={<AvgWinLossBar win={stats.avgWin ?? 0} loss={stats.avgLoss ?? 0} locale={locale} />}
      />
    </div>
  );
}
