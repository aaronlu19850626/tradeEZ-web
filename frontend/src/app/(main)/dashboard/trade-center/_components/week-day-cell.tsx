"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import type { Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";

import { formatStatMoney, formatWeekdayDate, toneClass, weekDayCellTone } from "../_lib/trade-center-model";

export function WeekDayCell({
  day,
  t,
  locale,
  onOpen,
}: {
  day: { key: string; net: number; count: number };
  t: TradeCenterText;
  locale: Locale;
  onOpen: () => void;
}) {
  const currency = useDisplayCurrency();
  const empty = day.count === 0;
  const profit = day.net >= 0;
  const tone = weekDayCellTone(day.count, day.net);
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={empty}
      onClick={onOpen}
      className={`flex h-auto flex-col items-stretch gap-1.5 rounded-lg border border-transparent px-3 py-2.5 text-right ${tone}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="pt-0.5">
          {!empty &&
            (profit ? <TrendingUp className="size-4 text-profit" /> : <TrendingDown className="size-4 text-loss" />)}
        </span>
        <span className="text-xs text-muted-foreground">{formatWeekdayDate(day.key, locale)}</span>
      </span>
      {/* Days without trades show only the date — no placeholder amount or count. */}
      {!empty && (
        <>
          <span className={`text-lg font-semibold tabular-nums ${toneClass(day.net)}`}>
            {formatStatMoney(day.net, locale, currency)}
          </span>
          <span className="text-xs text-muted-foreground">
            {day.count} {t.tradesUnit}
          </span>
        </>
      )}
    </Button>
  );
}
