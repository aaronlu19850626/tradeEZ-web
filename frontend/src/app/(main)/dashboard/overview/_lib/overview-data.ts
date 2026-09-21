"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { TradeDayDetailDialog } from "@/components/dialogs/trade-day-detail";
import { OutlineAction } from "@/components/shared/dashboard-actions";
import { InfoTip } from "@/components/shared/info-tip";
import { SymbolBadge } from "@/components/shared/symbol-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";
import { type DashboardText, fill } from "@/lib/tradesync/dashboard-i18n";
import { tradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import type { CompositeScore, ScoreDimensionKey } from "@/lib/tradesync/trade-score";
import {
  addDays,
  groupByDay as groupTradesByDay,
  type MockTrade,
  shanghaiDayKey,
  shanghaiWeekStart,
} from "@/lib/tradesync/trades-mock";

export const PROFIT_SOLID = "var(--profit-strong)";
export const LOSS_SOLID = "var(--loss-strong)";
export const PROFIT_TEXT = "var(--profit)";
export const LOSS_TEXT = "var(--loss)";
export const LINE_COLOR = "var(--primary)";
export const GRID_COLOR = "var(--border)";
export const CHART_LEFT_MARGIN = -4;
export const CHART_Y_AXIS_WIDTH = 56;
export const CHART_Y_TICK = { fontSize: 10, fill: "var(--muted-foreground)" };
export const CHART_Y_TICK_MARGIN = 3;
export const CHART_RESIZE_DEBOUNCE = 220;
export const PANEL_SHELL_CLASS = "h-full xl:h-[440px]";
export const PANEL_TITLE_CLASS = "font-bold text-base text-foreground";
export const PANEL_HEADER_CLASS = "h-10 shrink-0 items-center border-b border-border/70 pb-1";
export const PANEL_BODY_CLASS = "flex flex-1 flex-col pt-4";
export const PANEL_FOOTER_CLASS = "mt-auto flex h-16 items-center border-t border-border/70";

export const DIMENSION_LABEL: Record<ScoreDimensionKey, keyof DashboardText> = {
  expectancy: "dimExpectancy",
  risk: "dimRisk",
  payoff: "dimPayoff",
  recovery: "dimRecovery",
  consistency: "dimConsistency",
  winRate: "dimWinRate",
};

export const DIMENSION_TIP: Record<ScoreDimensionKey, keyof DashboardText> = {
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

export function moneyAxis(value: number, locale: Locale): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString(locale, { maximumFractionDigits: 0 })}`;
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

export function cumulativePoints(trades: MockTrade[]): { date: string; label: string; value: number }[] {
  const daily = new Map<string, number>();
  for (const trade of trades) {
    const day = shanghaiDayKey(trade.closeTime);
    daily.set(day, (daily.get(day) ?? 0) + trade.netPnl);
  }
  const days = [...daily.entries()].sort(([left], [right]) => (left < right ? -1 : 1));
  if (days.length === 0) return [];

  const axisDate = (epoch: number) => {
    const [year, month, day] = shanghaiDayKey(epoch).split("-");
    return `${month}/${day}/${year.slice(2)}`;
  };

  let running = 0;
  return days.map(([date, net]) => {
    running += net;
    const epoch = Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
    return {
      date,
      label: axisDate(epoch),
      value: Number(running.toFixed(2)),
    };
  });
}

export function drawdownPoints(trades: MockTrade[]): {
  points: { date: string; label: string; value: number }[];
  maxDrawdown: number;
} {
  let peak = 0;
  let worst = 0;
  const points = cumulativePoints(trades).map((point) => {
    peak = Math.max(peak, point.value);
    const value = Number((point.value - peak).toFixed(2));
    worst = Math.min(worst, value);
    return { ...point, value };
  });
  return { points, maxDrawdown: Math.abs(worst) };
}

export interface OverviewStats {
  count: number;
  net: number;
  winners: number;
  losers: number;
  breakEven: number;
  winRate: number;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  winDays: number;
  flatDays: number;
  lossDays: number;
  dayWinRate: number;
  days: DayStat[];
}

export function buildOverviewStats(trades: MockTrade[]): OverviewStats {
  const winners = trades.filter((trade) => trade.netPnl > 0);
  const losers = trades.filter((trade) => trade.netPnl < 0);
  const winSum = winners.reduce((sum, trade) => sum + trade.netPnl, 0);
  const lossSum = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0));
  const days = groupByDay(trades);
  return {
    count: trades.length,
    net: trades.reduce((sum, trade) => sum + trade.netPnl, 0),
    winners: winners.length,
    losers: losers.length,
    breakEven: trades.length - winners.length - losers.length,
    winRate: trades.length ? winners.length / trades.length : 0,
    profitFactor: lossSum > 0 ? winSum / lossSum : null,
    avgWin: winners.length ? winSum / winners.length : null,
    avgLoss: losers.length ? lossSum / losers.length : null,
    winDays: days.filter((day) => day.net > 0).length,
    flatDays: days.filter((day) => day.net === 0).length,
    lossDays: days.filter((day) => day.net < 0).length,
    dayWinRate: days.length ? days.filter((day) => day.net > 0).length / days.length : 0,
    days,
  };
}
