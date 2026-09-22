"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import type { Locale } from "@/lib/i18n";

import {
  CHART_LEFT_MARGIN,
  CHART_RESIZE_DEBOUNCE,
  CHART_Y_AXIS_WIDTH,
  CHART_Y_TICK,
  CHART_Y_TICK_MARGIN,
  GRID_COLOR,
  LINE_COLOR,
  LOSS_SOLID,
  money,
  moneyCompact,
  PROFIT_SOLID,
  tone,
} from "../../_lib/overview-data";

export function CumulativeChart({
  points,
  locale,
  heightClassName = "h-[240px]",
}: {
  points: { date: string; label: string; value: number }[];
  locale: Locale;
  heightClassName?: string;
}) {
  const currency = useDisplayCurrency();
  const expanded: { date: string; label: string; value: number }[] = [];
  for (const point of points) {
    const previous = expanded.at(-1);
    const crosses =
      previous !== undefined && previous.value !== 0 && point.value !== 0 && previous.value > 0 !== point.value > 0;
    if (previous && crosses) {
      expanded.push({ date: previous.date, label: "", value: 0 });
    }
    expanded.push(point);
  }

  const data = expanded.map((point, index) => ({
    ...point,
    x: index,
    pos: Math.max(point.value, 0),
    neg: Math.min(point.value, 0),
  }));
  const tickInterval = Math.max(0, Math.floor(data.length / 6));

  return (
    <div className={`w-full ${heightClassName}`}>
      <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: CHART_LEFT_MARGIN }}>
          <defs>
            <linearGradient id="overview-cumulative-pos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PROFIT_SOLID} stopOpacity={0.72} />
              <stop offset="100%" stopColor={PROFIT_SOLID} stopOpacity={0.12} />
            </linearGradient>
            <linearGradient id="overview-cumulative-neg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LOSS_SOLID} stopOpacity={0.12} />
              <stop offset="100%" stopColor={LOSS_SOLID} stopOpacity={0.72} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
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
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            content={<CumulativeTooltip locale={locale} />}
          />
          <Area
            type="linear"
            dataKey="pos"
            stroke="none"
            fill="url(#overview-cumulative-pos)"
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="neg"
            stroke="none"
            fill="url(#overview-cumulative-neg)"
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="value"
            stroke={LINE_COLOR}
            strokeWidth={1.6}
            dot={false}
            activeDot={{ r: 4.5, fill: LINE_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function formatChartDate(day: string): string {
  const [year, month, date] = day.split("-");
  return `${month}/${date}/${year}`;
}

export function PnlTooltipCard({ date, value, locale }: { date: string; value: number; locale: Locale }) {
  const currency = useDisplayCurrency();
  const label = formatChartDate(date);
  return (
    <div className="min-w-[230px] rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[0_14px_36px_rgb(32_20_61_/_14%)]">
      <div className="font-semibold text-sm">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="size-3.5 rounded-[3px]" style={{ background: LINE_COLOR }} />
        <span className="text-muted-foreground">{label}:</span>
        <span className={`font-medium tabular-nums ${tone(value)}`}>{money(value, locale, currency)}</span>
      </div>
    </div>
  );
}

export function CumulativeTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { payload: { date: string; value: number } }[];
  locale: Locale;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <PnlTooltipCard date={point.date} value={point.value} locale={locale} />;
}
