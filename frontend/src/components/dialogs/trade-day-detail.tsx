"use client";

import { type ReactNode, useMemo } from "react";

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

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import { InfoTip } from "@/components/shared/info-tip";
import { SymbolBadge } from "@/components/shared/symbol-badge";
import { TradeSideBadge } from "@/components/shared/trade-side-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatPrice,
  formatSigned,
  formatVolume,
} from "@/lib/format-numbers";
import type { Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import { type DayGroup, dayKeyToEpoch, type MockTrade, type TradeStats } from "@/lib/tradesync/trades-mock";

const PROFIT_SOLID = "var(--profit-strong)";
const LOSS_SOLID = "var(--loss-strong)";
const LINE_COLOR = "var(--primary)";
const GRID_COLOR = "var(--border)";

interface CurvePoint {
  index: number;
  value: number;
}

interface TrendPoint {
  x: number;
  value: number;
  pos: number;
  neg: number;
}

function buildTrendData(series: CurvePoint[]): TrendPoint[] {
  const expanded: { x: number; value: number }[] = [];
  for (const point of series) {
    const previous = expanded.at(-1);
    const crosses =
      previous !== undefined && previous.value !== 0 && point.value !== 0 && previous.value > 0 !== point.value > 0;
    if (previous && crosses) {
      const ratio = previous.value / (previous.value - point.value);
      expanded.push({ x: previous.x + (point.index - previous.x) * ratio, value: 0 });
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

function formatClock(epoch: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(epoch * 1000));
}

function formatDuration(seconds: number, t: TradeCenterText): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours >= 1) return minutes > 0 ? `${hours}${t.hoursUnit}${minutes}${t.minutesUnit}` : `${hours}${t.hoursUnit}`;
  if (minutes >= 1)
    return secs > 0 ? `${minutes}${t.minutesUnit}${secs}${t.secondsUnit}` : `${minutes}${t.minutesUnit}`;
  return `${secs}${t.secondsUnit}`;
}

function toneClass(value: number): string {
  if (value > 0) return "text-profit";
  if (value < 0) return "text-loss";
  return "text-muted-foreground";
}

function formatDayHeader(dayKey: string, locale: Locale): string {
  const [year, month, day] = dayKey.split("-");
  const date = new Date(dayKeyToEpoch(dayKey) * 1000);
  if (locale === "zh-CN") {
    const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(date);
    return `${year}年${month}月${day}日 ${weekday}`;
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatDayLong(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dayKeyToEpoch(dayKey) * 1000));
}

function DayTrendTooltip({
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
  const trade = index >= 1 && index <= ordered.length ? ordered[index - 1] : undefined;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-[0_10px_26px_rgb(32_20_61_/_16%)]">
      {trade && (
        <div className="text-xs text-muted-foreground">
          {trade.symbol} · {formatClock(trade.closeTime, locale)}
        </div>
      )}
      <div className="mt-0.5 flex items-baseline gap-1.5 text-sm font-semibold">
        <span className="text-xs font-normal text-muted-foreground">{t.cumulativeNet}</span>
        <span className={toneClass(point.value)}>{formatMoney(point.value, locale, currency)}</span>
      </div>
    </div>
  );
}

function DayTrendChart({
  series,
  trades,
  t,
  locale,
}: {
  series: CurvePoint[];
  trades: MockTrade[];
  t: TradeCenterText;
  locale: Locale;
}) {
  const currency = useDisplayCurrency();
  const data = buildTrendData(series);
  const ordered = useMemo(() => [...trades].sort((a, b) => a.closeTime - b.closeTime), [trades]);
  return (
    <div className="h-[180px] w-full min-w-0 overflow-hidden border-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="trade-day-pos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PROFIT_SOLID} stopOpacity={0.72} />
              <stop offset="100%" stopColor={PROFIT_SOLID} stopOpacity={0.12} />
            </linearGradient>
            <linearGradient id="trade-day-neg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LOSS_SOLID} stopOpacity={0.12} />
              <stop offset="100%" stopColor={LOSS_SOLID} stopOpacity={0.72} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis
            width={70}
            tickLine={false}
            axisLine={false}
            padding={{ top: 18, bottom: 18 }}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => formatMoneyCompact(value, locale, currency)}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <RechartsTooltip
            cursor={{ stroke: "var(--border)" }}
            content={<DayTrendTooltip ordered={ordered} locale={locale} t={t} />}
          />
          <Area type="linear" dataKey="pos" stroke="none" fill="url(#trade-day-pos)" isAnimationActive={false} />
          <Area type="linear" dataKey="neg" stroke="none" fill="url(#trade-day-neg)" isAnimationActive={false} />
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

function StatGrid({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
  const currency = useDisplayCurrency();
  const cells: { label: string; value: ReactNode; tip?: string }[] = [
    { label: t.totalTrades, value: stats.count, tip: t.tipTotalTrades },
    {
      label: t.grossPnl,
      value: <span className={toneClass(stats.gross)}>{formatMoney(stats.gross, locale, currency)}</span>,
      tip: t.tipGrossPnl,
    },
    { label: t.winnersLosers, value: `${stats.winners} / ${stats.losers}` },
    {
      label: t.swaps,
      value: <span className={toneClass(stats.swap)}>{formatMoney(stats.swap, locale, currency)}</span>,
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

function DayDetailTable({ trades, t, locale }: { trades: MockTrade[]; t: TradeCenterText; locale: Locale }) {
  const displayCurrency = useDisplayCurrency();
  const columns = [
    [t.colCloseTime, 96],
    [t.colOpenTime, 96],
    [t.colSymbol, 88],
    [t.colSide, 72],
    [t.colVolume, 80],
    [t.colNet, 100],
    [t.colEntry, 96],
    [t.colExit, 96],
    [t.colRr, 84],
    [t.colDuration, 96],
  ] as const;
  return (
    <div className="max-h-[400px] overflow-hidden rounded-lg border">
      <Table className="w-full table-fixed" containerClassName="max-h-[400px] overflow-y-auto">
        <colgroup>
          {columns.map(([label, width]) => (
            <col key={label} style={{ width }} />
          ))}
        </colgroup>
        <TableHeader className="[&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-10 [&>tr>th]:bg-muted">
          <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
            {columns.map(([label]) => (
              <TableHead key={label} className="h-9 text-center font-bold whitespace-nowrap">
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow key={trade.id} className="border-b transition-colors last:border-b-0 hover:bg-muted/25">
              <TableCell className="text-center tabular-nums">{formatClock(trade.closeTime, locale)}</TableCell>
              <TableCell className="text-center tabular-nums">{formatClock(trade.openTime, locale)}</TableCell>
              <TableCell className="text-center">
                <SymbolBadge value={trade.symbol} />
              </TableCell>
              <TableCell className="text-center">
                <TradeSideBadge side={trade.side} buyLabel={t.sideBuy} sellLabel={t.sideSell} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{trade.volume.toFixed(2)}</TableCell>
              <TableCell className={`text-right font-semibold tabular-nums ${toneClass(trade.netPnl)}`}>
                {formatMoney(trade.netPnl, locale, trade.currency ?? displayCurrency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {trade.openPrice === null ? t.na : formatPrice(trade.openPrice, locale)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatPrice(trade.closePrice, locale)}</TableCell>
              <TableCell className={`text-right tabular-nums ${toneClass(trade.rMultiple ?? 0)}`}>
                {trade.rMultiple === null ? t.na : `${formatSigned(trade.rMultiple, 2, locale)}R`}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{formatDuration(trade.durationSec, t)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TradeDayDetailDialog({
  day,
  t,
  locale,
  onClose,
  tradeTable,
}: {
  day: DayGroup | null;
  t: TradeCenterText;
  locale: Locale;
  onClose: () => void;
  tradeTable?: ReactNode;
}) {
  const currency = useDisplayCurrency();
  if (!day) return null;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[96vw] sm:max-w-[1480px]">
        <DialogHeader className="gap-1">
          <DialogTitle className="flex flex-wrap items-baseline gap-3 text-base">
            <span>{formatDayHeader(day.key, locale)}</span>
            <span className="flex items-baseline gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">{t.netPnl}</span>
              <span className={`text-base font-semibold tabular-nums ${toneClass(day.stats.net)}`}>
                {formatMoney(day.stats.net, locale, currency)}
              </span>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">{formatDayLong(day.key, locale)}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[72vh]">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <DayTrendChart series={day.series} trades={day.trades} t={t} locale={locale} />
            <StatGrid stats={day.stats} t={t} locale={locale} />
          </div>
          <div className="px-2 pt-3">{tradeTable ?? <DayDetailTable trades={day.trades} t={t} locale={locale} />}</div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
