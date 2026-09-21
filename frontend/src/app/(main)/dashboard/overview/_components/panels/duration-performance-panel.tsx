"use client";

import type { Locale } from "@/lib/i18n";
import type { MockTrade } from "@/lib/tradesync/trades-mock";

import { durationTicks, formatDurationAxis, PerformanceScatterChart } from "./performance-scatter";

export function DurationPerformanceChart({ trades, locale }: { trades: MockTrade[]; locale: Locale }) {
  const data = trades.map((trade) => {
    const duration = Math.max(0.1, trade.durationSec);
    return {
      x: duration,
      y: trade.netPnl,
      label: formatDurationAxis(duration),
    };
  });
  const minimum = Math.min(...data.map((point) => point.x), 0.1);
  const maximum = Math.max(...data.map((point) => point.x), 1);
  const ticks = durationTicks(minimum, maximum);

  return (
    <PerformanceScatterChart
      data={data}
      ticks={ticks}
      tickFormatter={formatDurationAxis}
      domain={[Math.max(0.1, minimum), Math.max(minimum * 1.01, maximum)]}
      useLogScale
      locale={locale}
    />
  );
}
