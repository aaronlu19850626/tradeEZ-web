"use client";

import { useEffect, useState } from "react";

import { ChevronRight, Play, StickyNote } from "lucide-react";

import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import type { DayGroup, MockTrade } from "@/lib/tradesync/trades-mock";

import {
  type ColumnKey,
  formatDayHeader,
  formatDayLabel,
  formatMoney,
  formatStatMoney,
  toneClass,
} from "../_lib/trade-center-model";
import { DayTrendChart, StatGrid } from "./trade-metric-cards";
import { LoadingWave, MetaButton } from "./trade-states";
import { TradeTable } from "./trade-table";

export function DayCharts({ group, t, locale }: { group: DayGroup; t: TradeCenterText; locale: Locale }) {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <DayTrendChart series={group.series} trades={group.trades} t={t} locale={locale} />
      <div className="mx-auto w-full max-w-3xl">
        <StatGrid stats={group.stats} t={t} locale={locale} />
      </div>
    </div>
  );
}

export function DayGroupCard({
  group,
  columns,
  t,
  locale,
  tableCommand,
  defaultTableOpen,
  tradesLoading,
  onLoadTrades,
}: {
  group: DayGroup;
  columns: ColumnKey[];
  t: TradeCenterText;
  locale: Locale;
  tableCommand: { value: boolean; version: number };
  defaultTableOpen: boolean;
  tradesLoading?: boolean;
  onLoadTrades?: () => Promise<MockTrade[] | undefined>;
}) {
  const currency = useDisplayCurrency();
  // Collapsing a day hides only the trade table; stats and icons stay visible.
  const [tableOpen, setTableOpen] = useState(defaultTableOpen);
  useEffect(() => {
    if (tableCommand.version > 0) setTableOpen(tableCommand.value);
  }, [tableCommand]);
  useEffect(() => {
    if (tableOpen && group.trades.length === 0 && !tradesLoading) void onLoadTrades?.();
  }, [group.trades.length, onLoadTrades, tableOpen, tradesLoading]);
  return (
    <Card className="gap-0 overflow-hidden pt-0 pb-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setTableOpen((prev) => !prev)}
          aria-expanded={tableOpen}
          aria-label={formatDayLabel(group.key, locale)}
          className="shrink-0"
        >
          <ChevronRight
            className={`size-4 text-muted-foreground transition-transform ${tableOpen ? "rotate-90" : ""}`}
          />
        </Button>
        <span className="text-base font-semibold">{formatDayHeader(group.key, locale)}</span>
        <span className="flex items-center gap-1.5 text-base">
          <span className="text-muted-foreground">{t.netPnl}</span>
          <span className={`font-semibold tabular-nums ${toneClass(group.stats.net)}`}>
            {formatStatMoney(group.stats.net, locale, currency)}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <MetaButton label={t.note} icon={<StickyNote className="size-4" />} />
          <MetaButton label={t.replay} icon={<Play className="size-4" />} />
        </span>
      </div>
      <div className="flex flex-col gap-6 border-t px-5 pt-3 pb-5">
        <DayCharts group={group} t={t} locale={locale} />
        {tableOpen && (
          <div className="overflow-hidden rounded-lg border">
            {tradesLoading && group.trades.length === 0 ? (
              <LoadingWave t={t} />
            ) : (
              <TradeTable trades={group.trades} columns={columns} t={t} locale={locale} compact />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
