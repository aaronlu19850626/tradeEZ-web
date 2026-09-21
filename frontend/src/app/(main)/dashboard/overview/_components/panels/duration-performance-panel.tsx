"use client";

import type { Locale } from "@/lib/i18n";

import { durationTicks, formatDurationAxis, PerformanceScatterChart } from "./performance-scatter";

export function DurationPerformanceChart({ points, locale }: { points: { x: number; y: number }[]; locale: Locale }) {
  const data = points.map((point) => ({ ...point, label: formatDurationAxis(point.x) }));
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
