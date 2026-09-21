"use client";

import { useEffect, useState } from "react";

import { ChevronRight, Play, StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import {
  computeStats,
  cumulativeSeries,
  type DayGroup,
  shanghaiDayKey,
  type WeekGroup,
} from "@/lib/tradesync/trades-mock";

import { type ColumnKey, formatMoney, formatWeekday, formatWeekRange, toneClass } from "../_lib/trade-center-model";
import { DayDetailDialog } from "./day-detail-dialog";
import { DailyChart, ScaleBar, StatGrid } from "./trade-metric-cards";
import { MetaButton } from "./trade-states";
import { TradeTable } from "./trade-table";
import { WeekDayCell } from "./week-day-cell";

export function WeekGroupCard({
  group,
  columns,
  t,
  locale,
  tableCommand,
  defaultTableOpen,
}: {
  group: WeekGroup;
  columns: ColumnKey[];
  t: TradeCenterText;
  locale: Locale;
  tableCommand: { value: boolean; version: number };
  defaultTableOpen: boolean;
}) {
  const [tableOpen, setTableOpen] = useState(defaultTableOpen);
  const [openDay, setOpenDay] = useState<DayGroup | null>(null);
  useEffect(() => {
    if (tableCommand.version > 0) setTableOpen(tableCommand.value);
  }, [tableCommand]);
  const bars = group.days.map((day) => ({ ...day, label: formatWeekday(day.key, locale) }));
  const openDayDetail = (dayKey: string) => {
    const dayTrades = group.trades.filter((trade) => shanghaiDayKey(trade.closeTime) === dayKey);
    setOpenDay({
      key: dayKey,
      weekday: new Date(`${dayKey}T00:00:00.000Z`).getUTCDay(),
      trades: [...dayTrades].sort((a, b) => b.closeTime - a.closeTime),
      stats: computeStats(dayTrades),
      series: cumulativeSeries(dayTrades),
    });
  };
  return (
    <Card className="gap-0 overflow-hidden pt-0 pb-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setTableOpen((prev) => !prev)}
          aria-expanded={tableOpen}
          className="shrink-0"
        >
          <ChevronRight
            className={`size-4 text-muted-foreground transition-transform ${tableOpen ? "rotate-90" : ""}`}
          />
        </Button>
        <span className="text-base font-semibold">{formatWeekRange(group.start, group.end, locale)}</span>
        <span className="flex items-center gap-1.5 text-base">
          <span className="text-muted-foreground">{t.netPnl}</span>
          <span className={`font-semibold tabular-nums ${toneClass(group.stats.net)}`}>
            {formatMoney(group.stats.net, locale)}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <MetaButton label={t.note} icon={<StickyNote className="size-4" />} />
          <MetaButton label={t.replay} icon={<Play className="size-4" />} />
        </span>
      </div>
      <div className="flex flex-col gap-6 border-t p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {group.days.map((day) => (
            <WeekDayCell key={day.key} day={day} t={t} locale={locale} onOpen={() => openDayDetail(day.key)} />
          ))}
        </div>
        <div className="grid items-center gap-6 lg:grid-cols-[38%_minmax(0,1fr)]">
          <DailyChart bars={bars} locale={locale} />
          <div className="flex flex-col gap-4">
            <StatGrid stats={group.stats} t={t} locale={locale} />
            <div className="border-t pt-4">
              <ScaleBar stats={group.stats} t={t} locale={locale} />
            </div>
          </div>
        </div>
        {tableOpen && (
          <div className="overflow-hidden rounded-lg border">
            <TradeTable trades={group.trades} columns={columns} t={t} locale={locale} compact />
          </div>
        )}
      </div>
      <DayDetailDialog day={openDay} columns={columns} t={t} locale={locale} onClose={() => setOpenDay(null)} />
    </Card>
  );
}
