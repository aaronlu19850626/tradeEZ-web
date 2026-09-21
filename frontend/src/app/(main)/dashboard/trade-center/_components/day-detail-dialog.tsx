"use client";

import { TradeDayDetailDialog } from "@/components/dialogs/trade-day-detail";
import type { Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import type { DayGroup } from "@/lib/tradesync/trades-mock";

import type { ColumnKey } from "../_lib/trade-center-model";
import { TradeTable } from "./trade-table";

export function DayDetailDialog({
  day,
  columns,
  t,
  locale,
  onClose,
}: {
  day: DayGroup | null;
  columns: ColumnKey[];
  t: TradeCenterText;
  locale: Locale;
  onClose: () => void;
}) {
  return (
    <TradeDayDetailDialog
      day={day}
      t={t}
      locale={locale}
      onClose={onClose}
      tradeTable={
        day ? (
          <TradeTable
            trades={day.trades}
            columns={columns.filter((key) => key !== "date")}
            t={t}
            locale={locale}
            compact
          />
        ) : null
      }
    />
  );
}
