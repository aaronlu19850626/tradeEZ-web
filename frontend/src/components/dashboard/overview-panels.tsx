"use client";

import type { ReactNode } from "react";

import { Info } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";
import { type DashboardText, fill } from "@/lib/tradesync/dashboard-i18n";
import type { CompositeScore, ScoreDimensionKey } from "@/lib/tradesync/trade-score";
import { addDays, type MockTrade, shanghaiDayKey, shanghaiWeekStart } from "@/lib/tradesync/trades-mock";

const PROFIT_SOLID = "#4ebf94";
const LOSS_SOLID = "#f06363";
const LINE_COLOR = "#6b5aa8";
const GRID_COLOR = "#e8e5f0";

const DIMENSION_LABEL: Record<ScoreDimensionKey, keyof DashboardText> = {
  expectancy: "dimExpectancy",
  risk: "dimRisk",
  payoff: "dimPayoff",
  recovery: "dimRecovery",
  consistency: "dimConsistency",
  winRate: "dimWinRate",
};

const DIMENSION_TIP: Record<ScoreDimensionKey, keyof DashboardText> = {
  expectancy: "dimExpectancyTip",
  risk: "dimRiskTip",
  payoff: "dimPayoffTip",
  recovery: "dimRecoveryTip",
  consistency: "dimConsistencyTip",
  winRate: "dimWinRateTip",
};

export function money(value: number, locale: Locale): string {
  const amount = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}$${amount}`;
}

export function moneyCompact(value: number, locale: Locale): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })}K`;
  return `${sign}$${abs.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
}

export function percent(value: number, locale: Locale, digits = 2): string {
  return `${value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function tone(value: number): string {
  if (value > 0) return "text-profit";
  if (value < 0) return "text-loss";
  return "text-muted-foreground";
}

export interface DayStat {
  day: string;
  net: number;
  count: number;
  wins: number;
}

export function groupByDay(trades: MockTrade[]): DayStat[] {
  const buckets = new Map<string, DayStat>();
  for (const trade of trades) {
    const day = shanghaiDayKey(trade.closeTime);
    const bucket = buckets.get(day) ?? { day, net: 0, count: 0, wins: 0 };
    bucket.net += trade.netPnl;
    bucket.count += 1;
    if (trade.netPnl > 0) bucket.wins += 1;
    buckets.set(day, bucket);
  }
  return [...buckets.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

export function cumulativePoints(trades: MockTrade[]): { label: string; value: number }[] {
  const ordered = [...trades].sort((a, b) => a.closeTime - b.closeTime);
  let running = 0;
  const points = [{ label: "", value: 0 }];
  for (const trade of ordered) {
    running += trade.netPnl;
    points.push({ label: shanghaiDayKey(trade.closeTime).slice(5), value: Number(running.toFixed(2)) });
  }
  return points;
}

export function drawdownPoints(trades: MockTrade[]): {
  points: { label: string; value: number }[];
  maxDrawdown: number;
} {
  const ordered = [...trades].sort((a, b) => a.closeTime - b.closeTime);
  let running = 0;
  let peak = 0;
  let worst = 0;
  const points = ordered.map((trade) => {
    running += trade.netPnl;
    peak = Math.max(peak, running);
    const value = Number((running - peak).toFixed(2));
    worst = Math.min(worst, value);
    return { label: shanghaiDayKey(trade.closeTime).slice(5), value };
  });
  return { points, maxDrawdown: Math.abs(worst) };
}

export function Panel({
  t,
  titleKey,
  tipKey,
  action,
  className,
  bodyClassName,
  children,
}: {
  t: DashboardText;
  titleKey: keyof DashboardText;
  tipKey: keyof DashboardText;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`gap-0 pt-4 pb-4 ${className ?? ""}`}>
      <CardHeader className="flex flex-row items-center justify-between py-0">
        <span className="flex items-center gap-1.5">
          <CardTitle className="font-bold text-foreground text-sm">{String(t[titleKey])}</CardTitle>
          <InfoTip label={String(t[titleKey])} text={String(t[tipKey])} />
        </span>
        {action}
      </CardHeader>
      <CardContent className={`pt-3 ${bodyClassName ?? ""}`}>{children}</CardContent>
    </Card>
  );
}

function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export function MetricCard({
  t,
  titleKey,
  tipKey,
  value,
  sub,
  children,
}: {
  t: DashboardText;
  titleKey: keyof DashboardText;
  tipKey: keyof DashboardText;
  value: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-2 pt-4 pb-4">
      <CardHeader className="flex flex-row items-center justify-between py-0">
        <span className="flex items-center gap-1.5">
          <CardTitle className="font-semibold text-muted-foreground text-sm">{String(t[titleKey])}</CardTitle>
          <InfoTip label={String(t[titleKey])} text={String(t[tipKey])} />
        </span>
        {sub}
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <div className="font-semibold text-2xl tabular-nums">{value}</div>
        {children}
      </CardContent>
    </Card>
  );
}

export function AccountScope({
  t,
  accounts,
  selected,
  onToggle,
}: {
  t: DashboardText;
  accounts: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">
        {t.accountScope}
        <span className="ml-1 text-foreground/70 tabular-nums">
          {selected.length}/{accounts.length}
        </span>
      </span>
      {accounts.map((account) => {
        const included = selected.includes(account.id);
        return (
          <button
            key={account.id}
            type="button"
            aria-pressed={included}
            onClick={() => onToggle(account.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-sm transition-colors ${
              included
                ? "border-primary/25 bg-primary/10 text-primary hover:bg-primary/18"
                : "border-dashed border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {account.name}
          </button>
        );
      })}
    </div>
  );
}

export function CountPills({
  t,
  winners,
  breakEven,
  losers,
}: {
  t: DashboardText;
  winners: number;
  breakEven: number;
  losers: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded-md bg-profit-soft px-2 py-0.5 font-medium text-profit">
        {t.winners} {winners}
      </span>
      <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground">
        {t.breakEven} {breakEven}
      </span>
      <span className="rounded-md bg-loss-soft px-2 py-0.5 font-medium text-loss">
        {t.losers} {losers}
      </span>
    </div>
  );
}

export function AvgWinLossBar({ win, loss, locale }: { win: number; loss: number; locale: Locale }) {
  const total = win + loss;
  const winRatio = total === 0 ? 0.5 : win / total;
  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        <span style={{ width: `${winRatio * 100}%`, background: PROFIT_SOLID }} />
        <span className="flex-1" style={{ background: LOSS_SOLID }} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-profit tabular-nums">{money(win, locale)}</span>
        <span className="text-loss tabular-nums">{money(-loss, locale)}</span>
      </div>
    </div>
  );
}

export function ScoreRadar({
  t,
  score,
  radar,
}: {
  t: DashboardText;
  locale: Locale;
  score: CompositeScore;
  radar: { key: ScoreDimensionKey; score: number }[];
}) {
  const data = radar.map((item) => ({ key: String(t[DIMENSION_LABEL[item.key]]), score: item.score }));
  if (score.insufficient) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="font-semibold text-lg text-muted-foreground">{t.scoreInsufficient}</p>
        <p className="text-xs text-muted-foreground">
          {fill(t.scoreInsufficientHint, { trades: score.sampleTrades, minTrades: 30, minR: 20 })}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke={GRID_COLOR} />
            <PolarAngleAxis dataKey="key" tick={{ fontSize: 11, fill: "#6b7280" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" stroke={LINE_COLOR} fill={LINE_COLOR} fillOpacity={0.32} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-sm">{t.scoreTotal}</span>
        <span className="font-semibold text-2xl tabular-nums">{score.total?.toFixed(1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(2, score.total ?? 0)}%`,
            background: `linear-gradient(90deg, ${LOSS_SOLID}, #f0b429, ${PROFIT_SOLID})`,
          }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {fill(t.scoreSample, { trades: score.sampleTrades, validR: score.validR })}
      </p>
    </div>
  );
}

function formatRaw(key: ScoreDimensionKey, raw: number): string {
  if (key === "consistency" || key === "winRate") return `${(raw * 100).toFixed(1)}%`;
  if (key === "recovery") return raw.toFixed(2);
  return `${raw}R`;
}

export function ScoreDialog({
  t,
  open,
  score,
  onClose,
}: {
  t: DashboardText;
  open: boolean;
  score: CompositeScore;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.scoreDetail}</DialogTitle>
          <DialogDescription>{t.scoreTip}</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-bold">{t.scoreDetail}</TableHead>
              <TableHead className="text-right font-bold">{t.rawValue}</TableHead>
              <TableHead className="text-right font-bold">{t.weight}</TableHead>
              <TableHead className="text-right font-bold">{t.weighted}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {score.dimensions.map((dimension) => (
              <TableRow key={dimension.key} className="border-b border-[#e8e5f0]">
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    {String(t[DIMENSION_LABEL[dimension.key]])}
                    <InfoTip
                      label={String(t[DIMENSION_LABEL[dimension.key]])}
                      text={String(t[DIMENSION_TIP[dimension.key]])}
                    />
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {dimension.raw === null ? t.na : formatRaw(dimension.key, dimension.raw)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{Math.round(dimension.weight * 100)}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(dimension.score * dimension.weight).toFixed(1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.scoreClose}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ConsistencyCell {
  day: string;
  net: number;
  count: number;
  intensity: number;
}

export function buildConsistency(days: DayStat[], latestDay: string): { cells: ConsistencyCell[]; weeks: string[] } {
  if (!latestDay) return { cells: [], weeks: [] };
  const byDay = new Map(days.map((day) => [day.day, day]));
  const endWeek = shanghaiWeekStart(Math.floor(new Date(`${latestDay}T00:00:00.000Z`).getTime() / 1000));
  const weeks: string[] = [];
  for (let index = 12; index >= 0; index -= 1) weeks.push(addDays(endWeek, -7 * index));
  const maxAbs = Math.max(1, ...days.map((day) => Math.abs(day.net)));
  const cells: ConsistencyCell[] = [];
  for (const week of weeks) {
    for (let offset = 0; offset < 7; offset += 1) {
      const day = addDays(week, offset);
      if (day > latestDay) continue;
      const entry = byDay.get(day);
      cells.push({
        day,
        net: entry?.net ?? 0,
        count: entry?.count ?? 0,
        // 0.6 × daily P&L strength; the checklist half arrives with the review module.
        intensity: entry ? Math.min(1, Math.abs(entry.net) / maxAbs) * 0.6 : 0,
      });
    }
  }
  return { cells, weeks };
}

export function ConsistencyHeatmap({
  t,
  statuses,
}: {
  t: DashboardText;
  statuses: { cells: ConsistencyCell[]; weeks: string[] };
}) {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (statuses.cells.length === 0) {
    return <p className="py-12 text-center text-muted-foreground text-sm">{t.na}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex flex-col gap-1 pt-4 text-[10px] text-muted-foreground">
          {weekdays.map((day) => (
            <span key={day} className="h-3 leading-3">
              {day}
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          {statuses.weeks.map((week, weekIndex) => {
            const month = Number(week.slice(5, 7));
            const previous = weekIndex > 0 ? Number(statuses.weeks[weekIndex - 1].slice(5, 7)) : null;
            return (
              <div key={week} className="flex flex-col gap-1">
                <span className="h-3 text-[10px] leading-3 text-muted-foreground">
                  {previous === month ? "" : `${month}月`}
                </span>
                {weekdays.map((_, offset) => {
                  const day = addDays(week, offset);
                  const cell = statuses.cells.find((item) => item.day === day);
                  if (!cell) return <span key={day} className="size-3 rounded-[3px]" />;
                  const strength = cell.net === 0 ? 0 : Math.max(0.18, cell.intensity);
                  const background =
                    cell.net === 0
                      ? "var(--muted)"
                      : `color-mix(in srgb, ${cell.net > 0 ? PROFIT_SOLID : LOSS_SOLID} ${Math.round(
                          strength * 100,
                        )}%, white)`;
                  return (
                    <Tooltip key={day}>
                      <TooltipTrigger asChild>
                        <span className="size-3 rounded-[3px]" style={{ background }} />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span>{day}</span>
                          <span className={tone(cell.net)}>{money(cell.net, "en-US")}</span>
                          <span>{fill(t.consistencyTrades, { count: cell.count })}</span>
                          <span className="text-muted-foreground">{t.consistencyChecklistOff}</span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>{t.consistencyLess}</span>
        {[0.15, 0.3, 0.45, 0.6].map((step) => (
          <span
            key={step}
            className="size-3 rounded-[3px]"
            style={{ background: `color-mix(in srgb, ${PROFIT_SOLID} ${Math.round(step * 100)}%, white)` }}
          />
        ))}
        <span>{t.consistencyMore}</span>
      </div>
    </div>
  );
}

export function CumulativeChart({ points, locale }: { points: { label: string; value: number }[]; locale: Locale }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="overview-cumulative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PROFIT_SOLID} stopOpacity={0.32} />
              <stop offset="100%" stopColor={PROFIT_SOLID} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} width={64} tickFormatter={(value: number) => moneyCompact(value, locale)} />
          <ReferenceLine y={0} stroke={GRID_COLOR} />
          <RechartsTooltip
            contentStyle={{ borderRadius: 10, border: `1px solid ${GRID_COLOR}`, fontSize: 12 }}
            formatter={(value) => [money(Number(value), locale), ""]}
          />
          <Area type="linear" dataKey="value" stroke={LINE_COLOR} strokeWidth={1.6} fill="url(#overview-cumulative)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyChart({ days, locale }: { days: DayStat[]; locale: Locale }) {
  const data = days.slice(-60);
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10 }}
            tickFormatter={(value: string) => value.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10 }} width={64} tickFormatter={(value: number) => moneyCompact(value, locale)} />
          <ReferenceLine y={0} stroke={GRID_COLOR} />
          <RechartsTooltip
            contentStyle={{ borderRadius: 10, border: `1px solid ${GRID_COLOR}`, fontSize: 12 }}
            formatter={(value) => [money(Number(value), locale), ""]}
          />
          <Bar dataKey="net" radius={[3, 3, 0, 0]}>
            {data.map((day) => (
              <Cell key={day.day} fill={day.net >= 0 ? PROFIT_SOLID : LOSS_SOLID} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DrawdownChart({
  points,
  maxDrawdown,
  t,
  locale,
}: {
  points: { label: string; value: number }[];
  maxDrawdown: number;
  t: DashboardText;
  locale: Locale;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-sm">{t.maxDrawdown}</span>
        <span className="font-semibold text-loss tabular-nums">{money(-maxDrawdown, locale)}</span>
      </div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="overview-drawdown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LOSS_SOLID} stopOpacity={0.04} />
                <stop offset="100%" stopColor={LOSS_SOLID} stopOpacity={0.32} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={64} tickFormatter={(value: number) => moneyCompact(value, locale)} />
            <RechartsTooltip
              contentStyle={{ borderRadius: 10, border: `1px solid ${GRID_COLOR}`, fontSize: 12 }}
              formatter={(value) => [money(Number(value), locale), ""]}
            />
            <Area type="linear" dataKey="value" stroke={LOSS_SOLID} strokeWidth={1.4} fill="url(#overview-drawdown)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BucketChart({
  buckets,
  locale,
}: {
  buckets: { key: string; net: number; count: number }[];
  locale: Locale;
}) {
  const data = buckets.map((bucket, index) => ({ ...bucket, index }));
  const maxAbs = Math.max(1, ...data.map((item) => Math.abs(item.net)));
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="index"
            type="number"
            domain={[-0.5, Math.max(0.5, data.length - 0.5)]}
            ticks={data.map((item) => item.index)}
            tick={{ fontSize: 10 }}
            tickFormatter={(value: number) => data[value]?.key ?? ""}
          />
          <YAxis tick={{ fontSize: 10 }} width={64} tickFormatter={(value: number) => moneyCompact(value, locale)} />
          <ReferenceLine y={0} stroke={GRID_COLOR} />
          <RechartsTooltip
            contentStyle={{ borderRadius: 10, border: `1px solid ${GRID_COLOR}`, fontSize: 12 }}
            formatter={(value) => [money(Number(value), locale), ""]}
            labelFormatter={(label) => data[Number(label)]?.key ?? ""}
          />
          <Scatter data={data} dataKey="net">
            {data.map((item) => (
              <Cell
                key={item.key}
                fill={item.net >= 0 ? PROFIT_SOLID : LOSS_SOLID}
                fillOpacity={0.35 + 0.55 * (Math.abs(item.net) / maxAbs)}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RecentTrades({ t, trades, locale }: { t: DashboardText; trades: MockTrade[]; locale: Locale }) {
  return (
    <Table className="w-full">
      <TableHeader>
        <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
          <TableHead className="font-bold">{t.colCloseTime}</TableHead>
          <TableHead className="text-center font-bold">{t.colSymbol}</TableHead>
          <TableHead className="text-right font-bold">{t.colNet}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((trade) => (
          <TableRow key={trade.id} className="border-b border-[#e8e5f0]">
            <TableCell className="text-muted-foreground">
              {new Intl.DateTimeFormat(locale, {
                timeZone: "Asia/Shanghai",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(trade.closeTime * 1000))}
            </TableCell>
            <TableCell className="text-center">
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono font-semibold text-xs">{trade.symbol}</span>
            </TableCell>
            <TableCell className={`text-right font-semibold tabular-nums ${tone(trade.netPnl)}`}>
              {money(trade.netPnl, locale)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export interface CalendarCell {
  day: string;
  inMonth: boolean;
  net: number;
  count: number;
  wins: number;
}

export interface CalendarModel {
  cells: CalendarCell[];
  weeks: { net: number; days: number }[];
  totalNet: number;
  tradedDays: number;
}

export function buildMonth(monthKey: string, days: DayStat[]): CalendarModel {
  if (!monthKey) return { cells: [], weeks: [], totalNet: 0, tradedDays: 0 };
  const byDay = new Map(days.map((day) => [day.day, day]));
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  const push = (dayKey: string, inMonth: boolean) => {
    const entry = byDay.get(dayKey);
    cells.push({
      day: dayKey,
      inMonth,
      net: entry?.net ?? 0,
      count: entry?.count ?? 0,
      wins: entry?.wins ?? 0,
    });
  };
  for (let index = leading; index > 0; index -= 1) {
    push(new Date(Date.UTC(year, month - 1, 1 - index)).toISOString().slice(0, 10), false);
  }
  for (let dayNumber = 1; dayNumber <= lastDay; dayNumber += 1) {
    push(`${monthKey}-${String(dayNumber).padStart(2, "0")}`, true);
  }
  let tail = 1;
  while (cells.length % 7 !== 0) {
    push(new Date(Date.UTC(year, month - 1, lastDay + tail)).toISOString().slice(0, 10), false);
    tail += 1;
  }
  const weeks: { net: number; days: number }[] = [];
  for (let index = 0; index < cells.length; index += 7) {
    const week = cells.slice(index, index + 7).filter((cell) => cell.inMonth && cell.count > 0);
    weeks.push({ net: week.reduce((sum, cell) => sum + cell.net, 0), days: week.length });
  }
  const inMonth = cells.filter((cell) => cell.inMonth);
  return {
    cells,
    weeks,
    totalNet: inMonth.reduce((sum, cell) => sum + cell.net, 0),
    tradedDays: inMonth.filter((cell) => cell.count > 0).length,
  };
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function MonthCalendar({
  t,
  locale,
  month,
  calendar,
}: {
  t: DashboardText;
  locale: Locale;
  month: string;
  calendar: CalendarModel;
}) {
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
  const monthLabel = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-sm">{monthLabel}</span>
        <span className="flex items-center gap-3 text-muted-foreground text-xs">
          <span>
            {t.calendarTotalNet}
            <span className={`ml-1 font-semibold tabular-nums ${tone(calendar.totalNet)}`}>
              {money(calendar.totalNet, locale)}
            </span>
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5">
            {fill(t.calendarDays, { count: calendar.tradedDays })}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_110px] gap-1">
        {weekdays.map((weekday) => (
          <span key={weekday} className="text-center text-[11px] text-muted-foreground">
            {weekday}
          </span>
        ))}
        <span className="text-center text-[11px] text-muted-foreground">{t.calendarMonthly}</span>
        {calendar.cells.map((cell, index) => {
          const weekIndex = Math.floor(index / 7);
          const week = calendar.weeks[weekIndex] ?? { net: 0, days: 0 };
          let background = "transparent";
          if (cell.count > 0) {
            background = `color-mix(in srgb, ${cell.net >= 0 ? PROFIT_SOLID : LOSS_SOLID} 16%, white)`;
          } else if (cell.inMonth) {
            background = "var(--muted)";
          }
          return (
            <div key={`${cell.day}-${weekIndex}`} className="flex flex-col gap-1">
              <div
                className={`flex h-[62px] flex-col justify-between rounded-md px-1.5 py-1 ${
                  cell.inMonth ? "text-foreground" : "text-muted-foreground/40"
                }`}
                style={{ background }}
              >
                <span className="text-[10px] tabular-nums">{Number(cell.day.slice(8, 10))}</span>
                {cell.count > 0 && (
                  <>
                    <span className={`font-semibold text-[10px] tabular-nums ${tone(cell.net)}`}>
                      {moneyCompact(cell.net, locale)}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {cell.count} · {Math.round((cell.wins / cell.count) * 100)}%
                    </span>
                  </>
                )}
              </div>
              {index % 7 === 6 && (
                <div className="flex h-[62px] flex-col justify-center rounded-md bg-muted/60 px-2 text-[10px]">
                  <span className="text-muted-foreground">{fill(t.calendarWeek, { n: weekIndex + 1 })}</span>
                  <span className={`font-semibold tabular-nums ${tone(week.net)}`}>
                    {moneyCompact(week.net, locale)}
                  </span>
                  <span className="text-muted-foreground">{fill(t.calendarDays, { count: week.days })}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
