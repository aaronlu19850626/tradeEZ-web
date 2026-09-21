"use client";

import type { Locale } from "@/lib/i18n";

import { PerformanceScatterChart } from "./performance-scatter";

function formatHourLabel(hour: number): string {
  return `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`;
}

export function TimePerformanceChart({
  points,
  basis,
  locale,
}: {
  points: { x: number; y: number }[];
  basis: "entry" | "exit";
  locale: Locale;
}) {
  const data = points.map((point) => ({ ...point, label: formatHourLabel(point.x) }));
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
