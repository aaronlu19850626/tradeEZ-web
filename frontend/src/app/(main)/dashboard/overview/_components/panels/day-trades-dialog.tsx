"use client";

import type { Locale } from "@/lib/i18n";
import { tradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import type { DayGroup } from "@/lib/tradesync/trades-mock";

import { DayDetailDialog } from "../../../trade-center/_components/day-detail-dialog";
import type { ColumnKey } from "../../../trade-center/_lib/trade-center-model";

const DAY_DIALOG_COLUMNS: ColumnKey[] = [
  "closeTime",
  "openTime",
  "symbol",
  "side",
  "volume",
  "net",
  "entry",
  "exit",
  "rr",
  "duration",
];

export function DayTradesDialog({
  locale,
  day,
  onClose,
}: {
  locale: Locale;
  day: DayGroup | null;
  onClose: () => void;
}) {
  return (
    <DayDetailDialog
      day={day}
      columns={DAY_DIALOG_COLUMNS}
      t={tradeCenterText[locale]}
      locale={locale}
      onClose={onClose}
    />
  );
}
