"use client";

import type { Locale } from "@/lib/i18n";
import type { MockTrade } from "@/lib/tradesync/trades-mock";

import { beijingHour, PerformanceScatterChart } from "./performance-scatter";

export function TimePerformanceChart({
  trades,
  basis,
  locale,
}: {
  trades: MockTrade[];
  basis: "entry" | "exit";
  locale: Locale;
}) {
  const data = trades.map((trade) => {
    const epoch = basis === "entry" ? trade.openTime : trade.closeTime;
    const hour = beijingHour(epoch);
    return {
      x: hour,
      y: trade.netPnl,
      label: `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`,
    };
  });
  const timeTicks = Array.from({ length: 13 }, (_, index) => index * 2);
  const timeTickLabel = (value: number) => (value === 24 ? "0:00" : `${Math.round(value)}:00`);

  return (
    <PerformanceScatterChart
      data={data}
      ticks={timeTicks}
      tickFormatter={timeTickLabel}
      domain={[0, 24]}
      locale={locale}
    />
  );
}
