"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DayButton } from "react-day-picker";
import { enUS, zhCN } from "react-day-picker/locale";

import { formatMonthLabel, monthKeyShift } from "@/components/filters/trade-filter-controls";
import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";
import { type TradeListParams, tradeCenterApi } from "@/lib/tradesync/trade-center";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import { dayKeyToEpoch, shanghaiDayKey, shanghaiWeekStart } from "@/lib/tradesync/trades-mock";

import {
  calendarCellTone,
  calendarNumberClass,
  dateToDayKey,
  dateToMonthKey,
  dayKeyToDate,
  formatDayLong,
  formatMoney,
  toneColor,
  type ViewMode,
} from "../_lib/trade-center-model";

export function SideRail({
  t,
  locale,
  range,
  latestDay,
  query,
  view,
  onPickDay,
  isFullRange,
}: {
  t: TradeCenterText;
  locale: Locale;
  range: { from: string; to: string };
  latestDay: string;
  query: TradeListParams;
  view: ViewMode;
  onPickDay: (dayKey: string) => void;
  isFullRange: boolean;
}) {
  const asideRef = useRef<HTMLElement>(null);
  const targetMonth = range.from
    ? isFullRange
      ? range.to.slice(0, 7)
      : range.from.slice(0, 7)
    : latestDay.slice(0, 7);
  const [cursor, setCursor] = useState(targetMonth);
  const [stuck, setStuck] = useState(false);
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);
  useEffect(() => {
    setCursor(targetMonth);
  }, [targetMonth]);
  const [calendar, setCalendar] = useState<Map<string, { net: number; count: number }>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void tradeCenterApi
      .calendar({ ...query, month: cursor })
      .then((days) => {
        if (cancelled) return;
        setCalendar(new Map(days.map((day) => [day.day, { net: day.net, count: day.count }])));
      })
      .catch(() => {
        if (!cancelled) setCalendar(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [cursor, query]);
  const calendarLocale = locale === "zh-CN" ? zhCN : enUS;

  useEffect(() => {
    const aside = asideRef.current;
    const grid = aside?.parentElement;
    if (!aside || !grid) return;
    const scroller = aside.closest<HTMLElement>('[data-slot="dashboard-workspace"]');
    let frame = 0;
    const measure = () => {
      frame = 0;
      const gridTop = grid.getBoundingClientRect().top;
      const containerTop = scroller?.getBoundingClientRect().top ?? 0;
      const scrollOffset = scroller?.scrollTop ?? window.scrollY;
      setStuck(scrollOffset > 0 && gridTop <= containerTop + 130);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    const target: EventTarget = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <aside
      ref={asideRef}
      style={{ top: stuck ? 149 : 129 }}
      className="flex flex-col gap-4 self-start xl:sticky xl:z-20"
    >
      <Card className="gap-3 pt-4 pb-4">
        <CardHeader className="flex flex-row items-center justify-between py-0">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.prevMonth}
            onClick={() => setCursor(monthKeyShift(cursor, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <CardTitle className="text-sm font-bold">{formatMonthLabel(cursor, locale)}</CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.nextMonth}
            onClick={() => setCursor(monthKeyShift(cursor, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="px-3">
          <Calendar
            mode="single"
            month={dayKeyToDate(`${cursor}-01`)}
            onMonthChange={(date) => setCursor(dateToMonthKey(date))}
            selected={range.from === range.to ? dayKeyToDate(range.from) : undefined}
            onSelect={(date) => {
              if (!date) return;
              const dayKey = dateToDayKey(date);
              if (calendar.has(dayKey)) onPickDay(dayKey);
            }}
            disabled={(date) => !calendar.has(dateToDayKey(date))}
            fixedWeeks
            showOutsideDays={false}
            disableNavigation
            locale={calendarLocale}
            className="w-full p-0 [--cell-size:2.25rem]"
            classNames={{
              months: "w-full",
              month: "w-full gap-2",
              month_caption: "hidden",
              nav: "hidden",
              month_grid: "w-full",
              weekdays: "flex w-full",
              weekday: "min-w-0 flex-1 basis-0 text-center text-[11px]",
              week: "mt-0.5 flex w-full",
              day: "h-9 min-w-0 flex-1 basis-0 p-0.5",
              disabled: "text-foreground/70 opacity-100",
            }}
            components={{
              // biome-ignore lint/correctness/noNestedComponentDefinitions: react-day-picker requires a component slot with this closure.
              DayButton: (props) => (
                <PnlCalendarDayButton
                  {...props}
                  calendar={calendar}
                  locale={locale}
                  calendarLocale={calendarLocale}
                  view={view}
                  hoveredWeek={hoveredWeek}
                  onHoverWeek={setHoveredWeek}
                  onPickDay={onPickDay}
                  t={t}
                />
              ),
            }}
          />
        </CardContent>
      </Card>
    </aside>
  );
}

export function PnlCalendarDayButton({
  day,
  modifiers,
  calendar,
  locale,
  calendarLocale,
  view,
  hoveredWeek,
  onHoverWeek,
  onPickDay,
  t,
  onMouseEnter,
  onMouseLeave,
  ...props
}: React.ComponentProps<typeof DayButton> & {
  calendar: Map<string, { net: number; count: number }>;
  locale: Locale;
  calendarLocale: typeof enUS;
  view: ViewMode;
  hoveredWeek: string | null;
  onHoverWeek: (weekKey: string | null) => void;
  onPickDay: (dayKey: string) => void;
  t: TradeCenterText;
}) {
  const currency = useDisplayCurrency();
  const dayKey = dateToDayKey(day.date);
  const dayCell = calendar.get(dayKey);
  const isToday = dayKey === shanghaiDayKey(Math.floor(Date.now() / 1000));
  const weekKey = shanghaiWeekStart(dayKeyToEpoch(dayKey));
  const weekHovered = view === "week" && hoveredWeek === weekKey;
  const button = (
    <CalendarDayButton
      {...props}
      day={day}
      modifiers={modifiers}
      locale={calendarLocale}
      aria-label={formatDayLong(dayKey, locale)}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        onHoverWeek(weekKey);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        onHoverWeek(null);
      }}
      className={`relative grid h-8 w-full grid-rows-[16px_3px] items-center justify-items-center gap-0.5 rounded-md p-0 leading-none shadow-none hover:bg-muted/60 disabled:opacity-100 ${calendarCellTone(
        weekHovered,
      )} ${isToday && !modifiers.selected ? "bg-muted" : ""} ${
        modifiers.selected
          ? "data-[selected-single=true]:bg-primary-soft data-[selected-single=true]:text-foreground"
          : ""
      }`}
    >
      <span
        className={`translate-y-[6px] text-xs leading-none font-semibold tabular-nums ${calendarNumberClass(dayCell?.net)}`}
      >
        {day.date.getDate()}
      </span>
      <span
        className="h-[3px] w-3.5 translate-y-1 rounded-full"
        style={dayCell ? { background: toneColor(dayCell.net) } : undefined}
        aria-hidden
      />
    </CalendarDayButton>
  );

  if (!dayCell) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="px-3 py-2">
        <div className="text-sm font-semibold">{formatDayLong(dayKey, locale)}</div>
        <div className="mt-1.5 flex items-stretch gap-2">
          <span className="w-[3px] rounded-full" style={{ background: toneColor(dayCell.net) }} />
          <div className="text-xs leading-relaxed">
            <div>
              {t.pnlLabel}: {formatMoney(dayCell.net, locale, currency)}
            </div>
            <div>
              {dayCell.count} {t.tradesUnit}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
