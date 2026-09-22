"use client";

import { type ReactNode, useMemo } from "react";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import { InfoTip } from "@/components/shared/info-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import { type MockTrade, shanghaiDayKey, type TradeStats } from "@/lib/tradesync/trades-mock";

import {
  formatClock,
  formatCount,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatStatMoney,
  formatVolume,
  GRID_COLOR,
  LINE_COLOR,
  LOSS_SOLID,
  PROFIT_SOLID,
  toneClass,
} from "../_lib/trade-center-model";

export function MetricCard({
  t,
  title,
  tip,
  value,
  footer,
  children,
}: {
  t: TradeCenterText;
  title: string;
  tip: ReactNode;
  value: ReactNode;
  footer?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-2 pt-4 pb-4">
      <CardHeader className="flex flex-row items-center gap-1.5 py-0">
        <CardTitle className="text-sm font-semibold text-muted-foreground">{title}</CardTitle>
        <InfoTip label={title} text={tip} />
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {children}
        {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
      <span className="sr-only">{t.title}</span>
    </Card>
  );
}

export function StatGrid({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
  const currency = useDisplayCurrency();
  const cells: { label: string; value: ReactNode; tip?: string }[] = [
    { label: t.totalTrades, value: formatCount(stats.count, locale), tip: t.tipTotalTrades },
    {
      label: t.grossPnl,
      value: <span className={toneClass(stats.gross)}>{formatStatMoney(stats.gross, locale, currency)}</span>,
      tip: t.tipGrossPnl,
    },
    { label: t.winnersLosers, value: `${formatCount(stats.winners, locale)} / ${formatCount(stats.losers, locale)}` },
    {
      label: t.swaps,
      value: <span className={toneClass(stats.swap)}>{formatStatMoney(stats.swap, locale, currency)}</span>,
      tip: t.tipSwaps,
    },
    { label: t.winRate, value: formatPercent(stats.winRate * 100, locale), tip: t.tipWinRate },
    {
      label: t.volume,
      value: formatVolume(stats.volume, locale),
    },
    {
      label: t.profitFactor,
      value: stats.profitFactor === null ? t.na : stats.profitFactor.toFixed(2),
      tip: t.tipProfitFactor,
    },
  ];
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            {cell.label}
            {cell.tip && <InfoTip label={cell.label} text={cell.tip} />}
          </span>
          <span className="text-xl font-semibold tabular-nums">{cell.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ScaleBar({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
  const currency = useDisplayCurrency();
  const loss = Math.abs(stats.netTrough);
  const profit = stats.netPeak;
  const total = loss + profit;
  const lossRatio = total === 0 ? 0.5 : loss / total;
  // The bigger side is drawn as a thick bar, the smaller side as a thin line.
  const lossIsBigger = loss >= profit;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <span className="flex items-center gap-1 text-sm font-semibold whitespace-nowrap">
        {t.scaleTitle}
        <InfoTip label={t.scaleTitle} text={t.tipScale} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex flex-col whitespace-nowrap">
          <span className="text-sm text-muted-foreground">{t.maxLoss}</span>
          <span className="text-sm font-medium tabular-nums text-loss">
            {formatStatMoney(stats.netTrough, locale, currency)}
          </span>
        </div>
        <span className="flex min-w-16 flex-1 items-center">
          {total === 0 ? (
            <span className="h-px w-full rounded-full bg-muted-foreground/40" />
          ) : (
            <>
              <span
                className={`${lossIsBigger ? "h-2" : "h-px"} rounded-l-full`}
                style={{ width: `${lossRatio * 100}%`, background: LOSS_SOLID }}
              />
              <span
                className={`flex-1 ${lossIsBigger ? "h-px" : "h-2"} rounded-r-full`}
                style={{ background: PROFIT_SOLID }}
              />
            </>
          )}
        </span>
        <div className="flex flex-col items-end whitespace-nowrap">
          <span className="text-sm text-muted-foreground">{t.maxProfit}</span>
          <span className="text-sm font-medium tabular-nums text-profit">
            {formatStatMoney(stats.netPeak, locale, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AvgWinLossBar({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
  const currency = useDisplayCurrency();
  const win = stats.avgWin ?? 0;
  const loss = stats.avgLoss ?? 0;
  const total = win + loss;
  const winRatio = total === 0 ? 0.5 : win / total;
  return (
    <div className="flex h-[92px] flex-col justify-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col gap-2">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              <span style={{ width: `${winRatio * 100}%`, background: PROFIT_SOLID }} />
              <span className="flex-1" style={{ background: LOSS_SOLID }} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tabular-nums text-profit">{formatStatMoney(win, locale, currency)}</span>
              <span className="tabular-nums text-loss">{formatStatMoney(loss, locale, currency)}</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0.5">
            <span>
              {t.resultWin} {formatStatMoney(win, locale, currency)}
            </span>
            <span>
              {t.resultLoss} {formatStatMoney(loss, locale, currency)}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
      {/* The average R stays on the card so the per-trade caliber is always readable. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t.avgRLabel}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {stats.avgR === null ? t.na : stats.avgR.toFixed(2)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{t.tipAvgWinLossR}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Full donut: green = gross profit share, red = gross loss share. */
export function DonutStat({ greenShare, label }: { greenShare: number; label: string }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const share = Math.max(0, Math.min(1, greenShare));
  return (
    <svg viewBox="0 0 64 64" className="size-24">
      <title>{label}</title>
      <circle cx="32" cy="32" r={radius} fill="none" stroke={LOSS_SOLID} strokeWidth="8" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke={PROFIT_SOLID}
        strokeWidth="8"
        strokeDasharray={`${circumference * share} ${circumference}`}
        transform="rotate(-90 32 32)"
      />
    </svg>
  );
}

/** Half-circle gauge plus win / break-even / loss pills. */
export function WinRateStats({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
  const share = Math.max(0, Math.min(1, stats.winRate));
  const length = Math.PI * 40;
  return (
    <div className="flex h-[92px] flex-col items-center justify-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <svg viewBox="0 0 96 52" className="w-24">
            <title>{formatPercent(stats.winRate * 100, locale)}</title>
            <path d="M8 48 A40 40 0 0 1 88 48" fill="none" stroke={LOSS_SOLID} strokeWidth="9" strokeLinecap="round" />
            <path
              d="M8 48 A40 40 0 0 1 88 48"
              fill="none"
              stroke={PROFIT_SOLID}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${length * share} ${length}`}
            />
          </svg>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0.5">
            <span>
              {t.resultWin} {formatCount(stats.winners, locale)}
            </span>
            <span>
              {t.resultFlat} {formatCount(stats.breakeven, locale)}
            </span>
            <span>
              {t.resultLoss} {formatCount(stats.losers, locale)}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <span className="rounded-full bg-profit-soft px-2 py-0.5 text-profit">
          {formatCount(stats.winners, locale)}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
          {formatCount(stats.breakeven, locale)}
        </span>
        <span className="rounded-full bg-loss-soft px-2 py-0.5 text-loss">{formatCount(stats.losers, locale)}</span>
      </div>
    </div>
  );
}

export interface CurvePoint {
  index: number;
  value: number;
}

export interface TrendPoint {
  x: number;
  value: number;
  pos: number;
  neg: number;
}

/**
 * Split the running P&L into a positive and a negative series. A zero-crossing
 * is inserted between samples so the green and red blocks meet exactly on the
 * zero line instead of overlapping into each other.
 */
export function buildTrendData(series: CurvePoint[]): TrendPoint[] {
  const expanded: { x: number; value: number }[] = [];
  for (const point of series) {
    const prev = expanded[expanded.length - 1];
    const crosses = prev !== undefined && prev.value !== 0 && point.value !== 0 && prev.value > 0 !== point.value > 0;
    if (prev && crosses) {
      const ratio = prev.value / (prev.value - point.value);
      expanded.push({ x: prev.x + (point.index - prev.x) * ratio, value: 0 });
    }
    expanded.push({ x: point.index, value: point.value });
  }
  return expanded.map((point) => ({
    x: point.x,
    value: point.value,
    pos: Math.max(point.value, 0),
    neg: Math.min(point.value, 0),
  }));
}

/** Day trend: line with green area above zero and red area below zero, plus a money Y axis. */
export function DayTrendTooltip({
  active,
  payload,
  ordered,
  locale,
  t,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
  ordered: MockTrade[];
  locale: Locale;
  t: TradeCenterText;
}) {
  const currency = useDisplayCurrency();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const index = Math.min(ordered.length, Math.max(1, Math.round(point.x)));
  const trade: MockTrade | undefined = index >= 1 && index <= ordered.length ? ordered[index - 1] : undefined;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-[0_10px_26px_rgb(32_20_61_/_16%)]">
      {trade && (
        <div className="text-xs text-muted-foreground">
          {shanghaiDayKey(trade.closeTime)} {formatClock(trade.closeTime, locale)} · {trade.symbol}
        </div>
      )}
      <div className="mt-0.5 flex items-baseline gap-1.5 text-sm font-semibold">
        <span className="text-xs font-normal text-muted-foreground">{t.cumulativeNet}</span>
        <span className={toneClass(point.value)}>{formatMoney(point.value, locale, currency)}</span>
      </div>
    </div>
  );
}

export function DayTrendChart({
  series,
  trades,
  t,
  locale,
  compact,
}: {
  series: CurvePoint[];
  trades: MockTrade[];
  t: TradeCenterText;
  locale: Locale;
  compact?: boolean;
}) {
  const currency = useDisplayCurrency();
  const data = buildTrendData(series);
  const ordered = useMemo(() => [...trades].sort((a, b) => a.closeTime - b.closeTime), [trades]);
  const height = compact ? 92 : 180;
  return (
    <div
      className="w-full min-w-0 overflow-hidden border-0 [&_*:focus-visible]:outline-none [&_*:focus]:outline-none"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 520, height }}>
        <ComposedChart
          data={data}
          margin={compact ? { top: 6, right: 8, bottom: 4, left: 0 } : { top: 10, right: 16, bottom: 8, left: 0 }}
        >
          <defs>
            <linearGradient id="day-pos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PROFIT_SOLID} stopOpacity={0.72} />
              <stop offset="100%" stopColor={PROFIT_SOLID} stopOpacity={0.12} />
            </linearGradient>
            <linearGradient id="day-neg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LOSS_SOLID} stopOpacity={0.12} />
              <stop offset="100%" stopColor={LOSS_SOLID} stopOpacity={0.72} />
            </linearGradient>
          </defs>
          {!compact && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />}
          <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} hide />
          {!compact && (
            <YAxis
              width={70}
              tickLine={false}
              axisLine={false}
              padding={{ top: 18, bottom: 18 }}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              tickFormatter={(value: number) => formatMoneyCompact(value, locale, currency)}
            />
          )}
          <ReferenceLine y={0} stroke="var(--border)" />
          <RechartsTooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            content={<DayTrendTooltip ordered={ordered} locale={locale} t={t} />}
          />
          <Area type="linear" dataKey="pos" stroke="none" fill="url(#day-pos)" isAnimationActive={false} />
          <Area type="linear" dataKey="neg" stroke="none" fill="url(#day-neg)" isAnimationActive={false} />
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

export interface WeekBar {
  key: string;
  net: number;
  count: number;
  label: string;
}

export function DailyTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { payload: WeekBar }[];
  locale: Locale;
}) {
  const currency = useDisplayCurrency();
  const bar = payload?.[0]?.payload;
  if (!active || !bar) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-[0_10px_26px_rgb(32_20_61_/_16%)]">
      <div className="text-sm font-semibold">{bar.label}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="size-2.5 rounded-[3px]" style={{ background: bar.net >= 0 ? PROFIT_SOLID : LOSS_SOLID }} />
        <span>
          {bar.label}: {formatMoney(bar.net, locale, currency)}
        </span>
      </div>
    </div>
  );
}

export function DailyChart({ bars, locale }: { bars: WeekBar[]; locale: Locale }) {
  const currency = useDisplayCurrency();
  return (
    <div className="h-[190px] w-full min-w-0 overflow-hidden border-0 [&_*:focus-visible]:outline-none [&_*:focus]:outline-none">
      <ResponsiveContainer width="100%" height={190} initialDimension={{ width: 320, height: 190 }}>
        <ComposedChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval={0}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            padding={{ top: 14, bottom: 14 }}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => formatMoneyCompact(value, locale, currency)}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <RechartsTooltip cursor={{ fill: "var(--muted)" }} content={<DailyTooltip locale={locale} />} />
          <Bar dataKey="net" radius={[2, 2, 2, 2]} isAnimationActive={false}>
            {bars.map((bar) => (
              <Cell key={bar.key} fill={bar.net >= 0 ? PROFIT_SOLID : LOSS_SOLID} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
