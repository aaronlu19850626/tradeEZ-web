"use client";

import { Fragment } from "react";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { OutlineAction } from "@/components/shared/dashboard-actions";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { type DashboardText, fill } from "@/lib/tradesync/dashboard-i18n";
import { shanghaiDayKey } from "@/lib/tradesync/trades-mock";

import { type DayStat, moneyCompact, moneyStat, tone } from "../../_lib/overview-data";

export interface CalendarCell {
  day: string;
  inMonth: boolean;
  net: number;
  count: number;
  wins: number;
}

export interface CalendarModel {
  cells: CalendarCell[];
  weeks: { net: number; days: number }[];
  totalNet: number;
  tradedDays: number;
}

export function buildMonth(monthKey: string, days: DayStat[]): CalendarModel {
  if (!monthKey) return { cells: [], weeks: [], totalNet: 0, tradedDays: 0 };
  const byDay = new Map(days.map((day) => [day.day, day]));
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells: CalendarCell[] = [];
  const push = (dayKey: string, inMonth: boolean) => {
    const entry = byDay.get(dayKey);
    cells.push({
      day: dayKey,
      inMonth,
      net: entry?.net ?? 0,
      count: entry?.count ?? 0,
      wins: entry?.wins ?? 0,
    });
  };
  for (let index = leading; index > 0; index -= 1) {
    push(new Date(Date.UTC(year, month - 1, 1 - index)).toISOString().slice(0, 10), false);
  }
  for (let dayNumber = 1; dayNumber <= lastDay; dayNumber += 1) {
    push(`${monthKey}-${String(dayNumber).padStart(2, "0")}`, true);
  }
  let tail = 1;
  while (cells.length % 7 !== 0) {
    push(new Date(Date.UTC(year, month - 1, lastDay + tail)).toISOString().slice(0, 10), false);
    tail += 1;
  }
  const weeks: { net: number; days: number }[] = [];
  for (let index = 0; index < cells.length; index += 7) {
    const week = cells.slice(index, index + 7).filter((cell) => cell.inMonth && cell.count > 0);
    weeks.push({ net: week.reduce((sum, cell) => sum + cell.net, 0), days: week.length });
  }
  const inMonth = cells.filter((cell) => cell.inMonth);
  return {
    cells,
    weeks,
    totalNet: inMonth.reduce((sum, cell) => sum + cell.net, 0),
    tradedDays: inMonth.filter((cell) => cell.count > 0).length,
  };
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function MonthCalendar({
  t,
  locale,
  month,
  calendar,
  onShiftMonth,
  onThisMonth,
  onOpenDay,
}: {
  t: DashboardText;
  locale: Locale;
  month: string;
  calendar: CalendarModel;
  onShiftMonth: (delta: number) => void;
  onThisMonth: () => void;
  onOpenDay: (day: string) => void;
}) {
  const weekday = (index: number) =>
    new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", weekday: "short" }).format(
      new Date(Date.UTC(2024, 0, 7 + index)),
    );
  const monthLabel = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
  const currentDay = shanghaiDayKey(Math.floor(Date.now() / 1000));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" aria-label={t.prevMonth} onClick={() => onShiftMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[160px] text-center font-semibold text-base">{monthLabel}</span>
          <Button variant="ghost" size="icon-sm" aria-label={t.nextMonth} onClick={() => onShiftMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <OutlineAction onClick={onThisMonth}>{t.thisMonth}</OutlineAction>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{t.calendarMonthly}:</span>
          <span className={`text-lg font-semibold tabular-nums ${tone(calendar.totalNet)}`}>
            {moneyStat(calendar.totalNet, locale)}
          </span>
          <span className="rounded-full bg-muted px-2 py-1 text-xs">
            {fill(t.calendarDays, { count: calendar.tradedDays })}
          </span>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 gap-2"
        style={{
          gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 172px",
          gridTemplateRows: `repeat(${calendar.cells.length / 7}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: 7 }, (_, index) => (
          <div key={weekday(index)} className="rounded-md border bg-muted/40 py-2 text-center font-semibold text-sm">
            {weekday(index)}
          </div>
        ))}
        <span />
        {calendar.cells.map((cell, index) => {
          const weekIndex = Math.floor(index / 7);
          const week = calendar.weeks[weekIndex] ?? { net: 0, days: 0 };
          const traded = cell.inMonth && cell.count > 0;
          const dayNumber = Number(cell.day.slice(8, 10));
          const cellClass = !cell.inMonth
            ? "border-transparent bg-transparent"
            : traded
              ? cell.net >= 0
                ? "border-profit-strong/40 bg-profit-soft"
                : "border-loss-strong/40 bg-loss-soft"
              : "border-transparent bg-muted/65";

          return (
            <Fragment key={`${cell.day}-${weekIndex}`}>
              <Button
                type="button"
                variant="ghost"
                disabled={!traded}
                onClick={() => traded && onOpenDay(cell.day)}
                className={`relative !h-full !min-h-0 rounded-md border p-2 text-center hover:bg-transparent ${cellClass} ${
                  traded ? "cursor-pointer hover:brightness-[0.985]" : "cursor-default"
                }`}
              >
                <span
                  className={`absolute top-2 right-2 flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
                    cell.day === currentDay ? "bg-primary font-semibold text-primary-foreground" : "text-foreground/80"
                  }`}
                >
                  {cell.inMonth ? dayNumber : ""}
                </span>
                {traded && (
                  <div className="flex h-full flex-col items-center justify-center gap-0.5 pt-2">
                    <span className="font-semibold text-base text-foreground/90 leading-tight tabular-nums">
                      {moneyCompact(cell.net, locale)}
                    </span>
                    <span className="text-xs text-muted-foreground leading-tight">
                      {fill(t.consistencyTrades, { count: cell.count })}
                    </span>
                    <span className="text-xs text-muted-foreground leading-tight">
                      {((cell.wins / cell.count) * 100).toLocaleString(locale, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2,
                      })}
                      %
                    </span>
                  </div>
                )}
                {traded && <CalendarDays className="absolute bottom-2 left-2 size-4 text-foreground/70" />}
              </Button>
              {index % 7 === 6 && (
                <div className="flex h-full min-h-0 flex-col justify-center rounded-lg border bg-card px-5 py-3">
                  <span className="text-muted-foreground text-sm">{fill(t.calendarWeek, { n: weekIndex + 1 })}</span>
                  <span className={`mt-1 font-semibold text-xl leading-tight tabular-nums ${tone(week.net)}`}>
                    {moneyCompact(week.net, locale)}
                  </span>
                  <span className="mt-2 w-fit rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {fill(t.calendarDays, { count: week.days })}
                  </span>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
