"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import type { Locale } from "@/lib/i18n";
import { useDisplayCurrency } from "@/components/shared/display-currency-provider";

import {
  CHART_LEFT_MARGIN,
  CHART_RESIZE_DEBOUNCE,
  CHART_Y_AXIS_WIDTH,
  CHART_Y_TICK,
  CHART_Y_TICK_MARGIN,
  type DayStat,
  GRID_COLOR,
  LOSS_SOLID,
  LOSS_TEXT,
  money,
  moneyCompact,
  PROFIT_SOLID,
  PROFIT_TEXT,
} from "../../_lib/overview-data";
import { formatChartDate } from "./cumulative-panel";

export function DailyPnlTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { payload: DayStat }[];
  locale: Locale;
}) {
  const currency = useDisplayCurrency();
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;

  const color = day.net >= 0 ? PROFIT_SOLID : LOSS_SOLID;
  return (
    <div className="relative rounded-xl border border-border/60 bg-card px-3 py-2 shadow-[0_10px_28px_rgb(32_20_61_/_12%)]">
      <div className="flex items-center gap-2 text-sm">
        <span
          className="size-4 rounded-[3px] border"
          style={{ background: color, borderColor: day.net >= 0 ? PROFIT_TEXT : LOSS_TEXT }}
        />
        <span className="font-medium">{formatChartDate(day.day)}:</span>
        <span className="font-medium tabular-nums">{money(day.net, locale, currency)}</span>
      </div>
      <span className="absolute top-1/2 -right-1 size-2 -translate-y-1/2 rotate-45 border-border/60 border-r border-t bg-card" />
    </div>
  );
}

export function DailyChart({ days, locale }: { days: DayStat[]; locale: Locale }) {
  const currency = useDisplayCurrency();
  const data = days.slice(-60);
  const tickInterval = Math.max(0, Math.floor(data.length / 5));
  const maxBarSize = data.length <= 7 ? 14 : data.length <= 14 ? 10 : data.length <= 31 ? 7 : 4;
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE}>
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: CHART_LEFT_MARGIN }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={formatChartDate}
            interval={tickInterval}
            minTickGap={28}
          />
          <YAxis
            width={CHART_Y_AXIS_WIDTH}
            tickLine={false}
            axisLine={false}
            tickMargin={CHART_Y_TICK_MARGIN}
            padding={{ top: 14, bottom: 14 }}
            tick={CHART_Y_TICK}
            tickFormatter={(value: number) => moneyCompact(value, locale, currency)}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <RechartsTooltip
            cursor={{ fill: "var(--muted)" }}
            content={<DailyPnlTooltip locale={locale} />}
            allowEscapeViewBox={{ x: true, y: true }}
          />
          <Bar dataKey="net" maxBarSize={maxBarSize} radius={[1, 1, 0, 0]} isAnimationActive={false}>
            {data.map((day) => (
              <Cell key={day.day} fill={day.net >= 0 ? PROFIT_SOLID : LOSS_SOLID} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
