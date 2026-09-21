"use client";

import { OutlineAction } from "@/components/shared/dashboard-actions";
import { InfoTip } from "@/components/shared/info-tip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";
import { type DashboardText, fill } from "@/lib/tradesync/dashboard-i18n";
import { addDays, shanghaiWeekStart } from "@/lib/tradesync/trades-mock";

import { type DayStat, money, tone } from "../../_lib/overview-data";
import { PanelFooter } from "./shared";

export interface ConsistencyCell {
  day: string;
  net: number;
  count: number;
  intensity: number;
}

export function buildConsistency(days: DayStat[], latestDay: string): { cells: ConsistencyCell[]; weeks: string[] } {
  if (!latestDay) return { cells: [], weeks: [] };
  const byDay = new Map(days.map((day) => [day.day, day]));
  const endWeek = shanghaiWeekStart(Math.floor(new Date(`${latestDay}T00:00:00.000Z`).getTime() / 1000));
  const weeks: string[] = [];
  for (let index = 12; index >= 0; index -= 1) weeks.push(addDays(endWeek, -7 * index));
  const maxAbs = Math.max(1, ...days.map((day) => Math.abs(day.net)));
  const cells: ConsistencyCell[] = [];
  for (const week of weeks) {
    for (let offset = 0; offset < 7; offset += 1) {
      const day = addDays(week, offset);
      if (day > latestDay) continue;
      const entry = byDay.get(day);
      cells.push({
        day,
        net: entry?.net ?? 0,
        count: entry?.count ?? 0,
        // 0.6 × daily P&L strength; the checklist half arrives with the review module.
        intensity: entry ? Math.min(1, Math.abs(entry.net) / maxAbs) * 0.6 : 0,
      });
    }
  }
  return { cells, weeks };
}

export function ConsistencyHeatmap({
  t,
  locale,
  statuses,
  onOpenChecklist,
}: {
  t: DashboardText;
  locale: Locale;
  statuses: { cells: ConsistencyCell[]; weeks: string[] };
  onOpenChecklist: () => void;
}) {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOffsets = [6, 0, 1, 2, 3, 4, 5];
  if (statuses.cells.length === 0) {
    return <p className="py-12 text-center text-muted-foreground text-sm">{t.na}</p>;
  }

  const monthGroups: { key: string; count: number }[] = [];
  for (const week of statuses.weeks) {
    const month = week.slice(0, 7);
    const previous = monthGroups.at(-1);
    if (previous?.key === month) previous.count += 1;
    else monthGroups.push({ key: month, count: 1 });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0">
        <div className="w-[52px] shrink-0">
          <div className="h-7" />
          {weekdays.map((weekday) => (
            <div key={weekday} className="flex h-[27px] items-center text-[13px] text-muted-foreground">
              {weekday}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className="min-w-max">
            <div
              className="grid h-7 items-end gap-x-1"
              style={{ gridTemplateColumns: `repeat(${statuses.weeks.length}, minmax(20px, 23px))` }}
            >
              {monthGroups.map((group) => (
                <span
                  key={group.key}
                  className="text-center text-[12px] text-primary/70"
                  style={{ gridColumn: `span ${group.count}` }}
                >
                  {new Intl.DateTimeFormat(locale, { month: "short" }).format(
                    new Date(`${group.key}-01T00:00:00.000Z`),
                  )}
                </span>
              ))}
            </div>

            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${statuses.weeks.length}, minmax(20px, 23px))` }}
            >
              {weekdays.flatMap((_, rowIndex) =>
                statuses.weeks.map((week) => {
                  const day = addDays(week, dayOffsets[rowIndex]);
                  const cell = statuses.cells.find((item) => item.day === day);
                  const level =
                    !cell || cell.count === 0 ? 0 : Math.max(1, Math.min(5, Math.ceil((cell.intensity / 0.6) * 5)));
                  const backgrounds = [
                    "var(--muted)",
                    "color-mix(in oklch, var(--primary) 10%, var(--card))",
                    "color-mix(in oklch, var(--primary) 22%, var(--card))",
                    "color-mix(in oklch, var(--primary) 38%, var(--card))",
                    "color-mix(in oklch, var(--primary) 62%, var(--card))",
                    "var(--primary)",
                  ];
                  const background = backgrounds[level];
                  const interactive = Boolean(cell && cell.count > 0);

                  if (!interactive) {
                    return <span key={day} className="aspect-square w-full rounded-[4px]" style={{ background }} />;
                  }

                  return (
                    <Tooltip key={day}>
                      <TooltipTrigger asChild>
                        <span
                          className="aspect-square w-full rounded-[4px] ring-1 ring-black/[0.03]"
                          style={{ background }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span>{day}</span>
                          <span className={tone(cell?.net ?? 0)}>{money(cell?.net ?? 0, locale)}</span>
                          <span>{fill(t.consistencyTrades, { count: cell?.count ?? 0 })}</span>
                          <span className="text-muted-foreground">{t.consistencyChecklistOff}</span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-[12px] text-muted-foreground">
        <span>{t.consistencyLess}</span>
        {[
          "color-mix(in oklch, var(--primary) 10%, var(--card))",
          "color-mix(in oklch, var(--primary) 22%, var(--card))",
          "color-mix(in oklch, var(--primary) 38%, var(--card))",
          "color-mix(in oklch, var(--primary) 62%, var(--card))",
          "var(--primary)",
        ].map((background) => (
          <span key={background} className="size-4 rounded-[4px] ring-1 ring-black/[0.03]" style={{ background }} />
        ))}
        <span>{t.consistencyMore}</span>
      </div>

      <PanelFooter>
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-foreground text-xs">
              <span>{t.todayScore}</span>
              <InfoTip label={t.todayScore} text={t.checklistUnavailable} />
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-medium text-2xl text-foreground/90 leading-none tabular-nums">0/5</span>
              <span className="h-2 w-40 rounded-full bg-muted">
                <span className="block h-full w-0 rounded-full bg-primary" />
              </span>
            </div>
          </div>
          <OutlineAction onClick={onOpenChecklist} title={t.checklistUnavailable}>
            {t.dailyChecklist}
          </OutlineAction>
        </div>
      </PanelFooter>
    </div>
  );
}
