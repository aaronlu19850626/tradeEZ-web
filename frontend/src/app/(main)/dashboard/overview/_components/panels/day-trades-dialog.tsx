"use client";

import { TradeDayDetailDialog } from "@/components/dialogs/trade-day-detail";
import type { Locale } from "@/lib/i18n";
import { tradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import { groupByDay, type MockTrade } from "@/lib/tradesync/trades-mock";

export function DayTradesDialog({
  locale,
  day,
  trades,
  onClose,
}: {
  locale: Locale;
  day: string | null;
  trades: MockTrade[];
  onClose: () => void;
}) {
  const group = day ? (groupByDay(trades).find((item) => item.key === day) ?? null) : null;
  return <TradeDayDetailDialog day={group} t={tradeCenterText[locale]} locale={locale} onClose={onClose} />;
}
