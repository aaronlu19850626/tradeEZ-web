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
  moneyAxis,
} from "../../_lib/overview-data";
import { CumulativeTooltip } from "./cumulative-panel";

export function DrawdownChart({
  points,
  locale,
}: {
  points: { date: string; label: string; value: number }[];
  locale: Locale;
}) {
  const currency = useDisplayCurrency();
  const tickInterval = Math.max(0, Math.floor(points.length / 6));
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: CHART_LEFT_MARGIN }}>
          <defs>
            <linearGradient id="overview-drawdown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LOSS_SOLID} stopOpacity={0.04} />
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
            domain={[(dataMin: number) => Math.min(0, dataMin), 0]}
            tick={CHART_Y_TICK}
            tickFormatter={(value: number) => moneyAxis(value, locale, currency)}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <RechartsTooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            content={<CumulativeTooltip locale={locale} />}
          />
          <Area
            type="linear"
            dataKey="value"
            baseValue={0}
            stroke="none"
            fill="url(#overview-drawdown)"
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
