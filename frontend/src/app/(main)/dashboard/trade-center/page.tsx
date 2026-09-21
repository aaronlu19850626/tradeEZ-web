"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Info,
  Play,
  Plus,
  Search,
  StickyNote,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Locale, useLocale } from "@/lib/i18n";
import { COLUMN_PREFERENCE_NAMESPACE, preferencesApi } from "@/lib/tradesync/preferences";
import type { TradeAccount } from "@/lib/tradesync/trade-center";
import { type TradeCenterText, tradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import {
  addDays,
  calendarCells,
  computeStats,
  cumulativeSeries,
  type DayGroup,
  dayKeyToEpoch,
  groupByDay,
  groupByWeek,
  type MockTrade,
  shanghaiDayKey,
  shanghaiWeekStart,
  type TradeStats,
  type WeekGroup,
} from "@/lib/tradesync/trades-mock";
import { useTradeData } from "@/lib/tradesync/use-trade-data";

type ViewMode = "day" | "week" | "all";
type SideFilter = "all" | "buy" | "sell";
type ResultFilter = "all" | "win" | "loss";
type ColumnKey =
  | "date"
  | "closeTime"
  | "openTime"
  | "side"
  | "symbol"
  | "volume"
  | "entry"
  | "exit"
  | "slTp"
  | "net"
  | "rr"
  | "points"
  | "swap"
  | "commission"
  | "duration"
  | "account"
  | "strategy";

/** Table column order: fixed columns first, then the configurable ones. */
const COLUMN_ORDER: ColumnKey[] = [
  "date",
  "closeTime",
  "openTime",
  "symbol",
  "side",
  "volume",
  "net",
  "entry",
  "exit",
  "rr",
  "points",
  "slTp",
  "swap",
  "commission",
  "duration",
  "account",
  "strategy",
];

/**
 * Always rendered and not configurable. "date" is fixed for the week/all views
 * and hidden in the day view because the groups are already days.
 */
const FIXED_COLUMNS: ColumnKey[] = [
  "date",
  "closeTime",
  "openTime",
  "symbol",
  "side",
  "volume",
  "net",
  "entry",
  "exit",
];

/** Columns the column picker manages; each view keeps its own selection. */
const OPTIONAL_COLUMNS: ColumnKey[] = COLUMN_ORDER.filter((key) => !FIXED_COLUMNS.includes(key));

/** Each view keeps its own configurable set, so 全部视图 can show everything by default. */
const DEFAULT_OPTIONAL_BY_VIEW: Record<ViewMode, ColumnKey[]> = {
  day: ["rr", "duration"],
  week: ["rr", "duration"],
  all: OPTIONAL_COLUMNS,
};

const SORTABLE_COLUMNS: ColumnKey[] = COLUMN_ORDER.filter((key) => key !== "slTp" && key !== "strategy");

// Palette approved from the tracking reference screenshots.
const PROFIT_TEXT = "#29a277";
const PROFIT_SOLID = "#4ebf94";
const LOSS_TEXT = "#e74d4c";
const LOSS_SOLID = "#f06363";
const LINE_COLOR = "#6b5aa8";
const GRID_COLOR = "#e8e5f0";

type ColumnAlign = "left" | "center" | "right";

/**
 * Column width and alignment. Text reads left, short identifiers center, and
 * every quantity right-aligns so digits line up between rows.
 */
const COLUMN_META: Record<ColumnKey, { width: number; align: ColumnAlign }> = {
  date: { width: 96, align: "left" },
  closeTime: { width: 96, align: "center" },
  openTime: { width: 96, align: "center" },
  symbol: { width: 88, align: "center" },
  side: { width: 72, align: "center" },
  volume: { width: 80, align: "right" },
  net: { width: 100, align: "right" },
  slTp: { width: 164, align: "center" },
  entry: { width: 96, align: "right" },
  exit: { width: 96, align: "right" },
  rr: { width: 84, align: "right" },
  points: { width: 88, align: "right" },
  swap: { width: 88, align: "right" },
  commission: { width: 88, align: "right" },
  duration: { width: 96, align: "right" },
  account: { width: 96, align: "left" },
  strategy: { width: 96, align: "left" },
};

function alignClass(align: ColumnAlign): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

/** The All view inlines the date into the time columns, so they need more room. */
function columnWidth(key: ColumnKey, dateInline: boolean): number {
  if (dateInline && (key === "closeTime" || key === "openTime")) return 178;
  return COLUMN_META[key].width;
}

function monthStart(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

function monthEnd(dayKey: string): string {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthKeyShift(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7)) - 1 + delta;
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quarterStart(dayKey: string): string {
  const month = Number(dayKey.slice(5, 7));
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${dayKey.slice(0, 4)}-${String(startMonth).padStart(2, "0")}-01`;
}

function formatMoney(value: number, locale: Locale): string {
  const amount = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}$${amount}`;
}

function formatMoneyCompact(value: number, locale: Locale): string {
  const amount = Math.abs(Math.round(value)).toLocaleString(locale, { maximumFractionDigits: 0 });
  return `${value < 0 ? "-" : ""}$${amount}`;
}

function formatSigned(value: number, digits: number, locale: Locale): string {
  const text = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value < 0 ? "-" : ""}${text}`;
}

function formatPercent(value: number, locale: Locale): string {
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatPrice(value: number, locale: Locale): string {
  const digits = value >= 10 ? 2 : 5;
  return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 10小时3分钟 / 24分钟34秒 / 45秒 — no leading zeros, no seconds once past an hour. */
function formatDuration(seconds: number, t: TradeCenterText): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours >= 1) {
    return minutes > 0 ? `${hours}${t.hoursUnit}${minutes}${t.minutesUnit}` : `${hours}${t.hoursUnit}`;
  }
  if (minutes >= 1) {
    return secs > 0 ? `${minutes}${t.minutesUnit}${secs}${t.secondsUnit}` : `${minutes}${t.minutesUnit}`;
  }
  return `${secs}${t.secondsUnit}`;
}

function toneClass(value: number): string {
  if (value > 0) return "text-profit";
  if (value < 0) return "text-loss";
  return "text-muted-foreground";
}

function toneColor(value: number): string {
  if (value > 0) return PROFIT_TEXT;
  if (value < 0) return LOSS_TEXT;
  return "#8b8b96";
}

function rangeDayClass(selected: boolean, between: boolean): string {
  if (selected) return "bg-primary font-semibold text-primary-foreground";
  if (between) return "bg-primary/12 text-primary";
  return "hover:bg-muted";
}

function calendarNumberClass(net: number | undefined): string {
  if (net === undefined) return "text-muted-foreground/60";
  if (net > 0) return "text-[#29a277]";
  if (net < 0) return "text-[#e74d4c]";
  return "text-muted-foreground";
}

function calendarCellTone(weekHovered: boolean, hasTrades: boolean): string {
  if (weekHovered) return "bg-primary/20";
  return hasTrades ? "bg-primary/6" : "";
}

function weekDayCellTone(count: number, net: number): string {
  if (count === 0) return "bg-muted/40 text-muted-foreground";
  return net >= 0 ? "bg-profit-soft hover:border-profit-strong" : "bg-loss-soft hover:border-loss-strong";
}

function ariaSortState(active: boolean, dir: "asc" | "desc" | undefined): "ascending" | "descending" | undefined {
  if (!active) return undefined;
  return dir === "asc" ? "ascending" : "descending";
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" | undefined }): ReactNode {
  if (!active) return <ChevronDown className="size-3 opacity-30" />;
  return dir === "asc" ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />;
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

/** 2026.09.20 06:40:25 / Sep 20, 2026 06:40:25 */
function formatDateTime(epoch: number, locale: Locale): string {
  const [year, month, day] = shanghaiDayKey(epoch).split("-");
  if (locale === "zh-CN") {
    return `${year}.${month}.${day} ${formatClock(epoch, locale)}`;
  }
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(epoch * 1000));
  return `${date} ${formatClock(epoch, locale)}`;
}

function formatMonthLabel(monthKey: string, locale: Locale): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", year: "numeric", month: "long" }).format(date);
}

function formatDayLabel(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dayKeyToEpoch(dayKey) * 1000));
}

function formatDayLong(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dayKeyToEpoch(dayKey) * 1000));
}

/** 2026年09月10日 周五 */
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

function formatShortDay(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dayKeyToEpoch(dayKey) * 1000));
}

function formatWeekday(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", weekday: "short" }).format(
    new Date(dayKeyToEpoch(dayKey) * 1000),
  );
}

/** 周四 18日 / Thu 18 */
function formatWeekdayDate(dayKey: string, locale: Locale): string {
  const weekday = formatWeekday(dayKey, locale);
  const day = Number(dayKey.slice(8, 10));
  return locale === "zh-CN" ? `${weekday} ${day}日` : `${weekday} ${day}`;
}

/** 2026年09月14日 - 09月20日 / Sep 14 - Sep 20, 2026 */
function formatWeekRange(startKey: string, endKey: string, locale: Locale): string {
  if (locale === "zh-CN") {
    const [year, startMonth, startDay] = startKey.split("-");
    const [, endMonth, endDay] = endKey.split("-");
    return `${year}年${startMonth}月${startDay}日 - ${endMonth}月${endDay}日`;
  }
  const monthDay = (key: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", month: "short", day: "numeric" }).format(
      new Date(dayKeyToEpoch(key) * 1000),
    );
  const year = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", year: "numeric" }).format(
    new Date(dayKeyToEpoch(endKey) * 1000),
  );
  return `${monthDay(startKey)} - ${monthDay(endKey)}, ${year}`;
}

function formatRangeLabel(from: string, to: string, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${formatter.format(new Date(dayKeyToEpoch(from) * 1000))} - ${formatter.format(new Date(dayKeyToEpoch(to) * 1000))}`;
}

function matchSide(trade: MockTrade, side: SideFilter): boolean {
  return side === "all" || trade.side === side;
}

function matchResult(trade: MockTrade, result: ResultFilter): boolean {
  if (result === "all") return true;
  if (result === "win") return trade.netPnl > 0;
  return trade.netPnl < 0;
}

function inRange(trade: MockTrade, from: string, to: string): boolean {
  const key = shanghaiDayKey(trade.closeTime);
  return key >= from && key <= to;
}

function sortValue(trade: MockTrade, key: ColumnKey): number | string | null {
  switch (key) {
    case "date":
      return shanghaiDayKey(trade.closeTime);
    case "closeTime":
      return trade.closeTime;
    case "openTime":
      return trade.openTime;
    case "side":
      return trade.side;
    case "symbol":
      return trade.symbol;
    case "volume":
      return trade.volume;
    case "entry":
      return trade.openPrice;
    case "exit":
      return trade.closePrice;
    case "slTp":
      return trade.slPrice;
    case "net":
      return trade.netPnl;
    case "rr":
      return trade.rMultiple ?? Number.NEGATIVE_INFINITY;
    case "points":
      return trade.points;
    case "swap":
      return trade.swap;
    case "commission":
      return trade.commission;
    case "duration":
      return trade.durationSec;
    case "account":
      return trade.accountName;
    default:
      return 0;
  }
}

function compareTrade(a: MockTrade, b: MockTrade, key: ColumnKey): number {
  const left = sortValue(a, key);
  const right = sortValue(b, key);
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

export default function TradeCenterPage() {
  const locale = useLocale();
  const t = tradeCenterText[locale];
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarStuck, setToolbarStuck] = useState(false);
  // Height budget for the all view so the page itself never scrolls; only the
  // table body does, which keeps the sticky header flush under the toolbar.
  const [viewportBudget, setViewportBudget] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<ViewMode>("day");
  const { accounts, trades, fetching, fetchError, reload: loadData } = useTradeData();
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [side, setSide] = useState<SideFilter>("all");
  const [result, setResult] = useState<ResultFilter>("all");
  const [symbol, setSymbol] = useState<string>("all");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [optionalByView, setOptionalByView] = useState<Record<ViewMode, ColumnKey[]>>(() => ({
    day: [...DEFAULT_OPTIONAL_BY_VIEW.day],
    week: [...DEFAULT_OPTIONAL_BY_VIEW.week],
    all: [...DEFAULT_OPTIONAL_BY_VIEW.all],
  }));
  const optionalColumns = optionalByView[view];
  const setOptionalColumns = (next: ColumnKey[]) => setOptionalByView((prev) => ({ ...prev, [view]: next }));
  const [columnOpen, setColumnOpen] = useState(false);
  const [dayVisible, setDayVisible] = useState(8);
  const [weekVisible, setWeekVisible] = useState(6);
  const [page, setPage] = useState(1);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const latestDay = useMemo(
    () => (trades?.length ? shanghaiDayKey(Math.max(...trades.map((trade) => trade.closeTime))) : ""),
    [trades],
  );
  const earliestDay = useMemo(
    () => (trades?.length ? shanghaiDayKey(Math.min(...trades.map((trade) => trade.closeTime))) : ""),
    [trades],
  );
  const defaultAccountIds = useMemo(
    () => accounts.filter((account) => account.isStatistics).map((account) => account.id),
    [accounts],
  );
  // Fall back to every account when none is flagged for statistics, so the page
  // still has something to show instead of an empty scope.
  const scopeDefaults = useMemo(
    () => (defaultAccountIds.length > 0 ? defaultAccountIds : accounts.map((account) => account.id)),
    [defaultAccountIds, accounts],
  );

  // Follow the account module's statistics set: a change resets the page scope,
  // and accounts that no longer exist are dropped.
  const lastScopeKey = useRef<string | null>(null);
  // Set when a deep link carries an account scope; consumed once accounts load.
  const pendingScopeRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (accounts.length === 0) return;
    const statisticsIds = accounts.filter((account) => account.isStatistics).map((account) => account.id);
    const fallback = statisticsIds.length > 0 ? statisticsIds : accounts.map((account) => account.id);
    const key = fallback.join(",");
    const pending = pendingScopeRef.current;
    if (pending !== null) {
      pendingScopeRef.current = null;
      lastScopeKey.current = key;
      const alive = pending.filter((id) => accounts.some((account) => account.id === id));
      setAccountIds(alive.length > 0 ? alive : [...fallback]);
      return;
    }
    const statisticsChanged = key !== lastScopeKey.current;
    lastScopeKey.current = key;
    setAccountIds((prev) => {
      const alive = prev.filter((id) => accounts.some((account) => account.id === id));
      if (statisticsChanged || alive.length === 0) return [...fallback];
      return alive.length === prev.length ? prev : alive;
    });
  }, [accounts]);

  const scopeIsDefault =
    accountIds.length === scopeDefaults.length && scopeDefaults.every((id) => accountIds.includes(id));

  // Deep links: view, filters, date range, account scope and page mirror into the
  // URL so a refresh or a shared link restores the same screen.
  const applyUrlState = useCallback(
    (params: URLSearchParams) => {
      const nextView = params.get("view");
      if (nextView === "day" || nextView === "week" || nextView === "all") setView(nextView);
      const from = params.get("from");
      const to = params.get("to");
      if (from && to) setRange({ from, to });
      const nextSide = params.get("side");
      if (nextSide === "all" || nextSide === "buy" || nextSide === "sell") setSide(nextSide);
      const nextResult = params.get("result");
      if (nextResult === "all" || nextResult === "win" || nextResult === "loss") setResult(nextResult);
      const nextSymbol = params.get("symbol");
      if (nextSymbol) setSymbol(nextSymbol);
      const nextPage = Number(params.get("page"));
      if (Number.isInteger(nextPage) && nextPage > 0) setPage(nextPage);
      const accountsParam = params.get("accounts");
      if (accountsParam) {
        const ids = accountsParam.split(",").filter(Boolean);
        const known = accounts.filter((account) => ids.includes(account.id)).map((account) => account.id);
        if (known.length > 0) setAccountIds(known);
        else pendingScopeRef.current = ids;
      }
    },
    [accounts],
  );
  const applyUrlRef = useRef(applyUrlState);
  applyUrlRef.current = applyUrlState;

  const [urlSynced, setUrlSynced] = useState(false);
  useEffect(() => {
    applyUrlRef.current(new URLSearchParams(window.location.search));
    setUrlSynced(true);
    const onPop = () => applyUrlRef.current(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!urlSynced) return;
    const params = new URLSearchParams();
    if (view !== "day") params.set("view", view);
    // Only pin a range when it differs from the full synced span.
    if (range.from && range.to && (range.from !== earliestDay || range.to !== latestDay)) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    if (side !== "all") params.set("side", side);
    if (result !== "all") params.set("result", result);
    if (symbol !== "all") params.set("symbol", symbol);
    if (!scopeIsDefault && accountIds.length > 0) params.set("accounts", accountIds.join(","));
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [
    urlSynced,
    view,
    range.from,
    range.to,
    side,
    result,
    symbol,
    accountIds,
    page,
    earliestDay,
    latestDay,
    scopeIsDefault,
  ]);

  // Column choices persist per user, so they survive a reload and follow the
  // account to another device.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await preferencesApi.read<Partial<Record<ViewMode, ColumnKey[]>>>(COLUMN_PREFERENCE_NAMESPACE);
        const payload = saved.payload;
        if (cancelled || !payload) return;
        setOptionalByView((prev) => {
          const next = { ...prev };
          for (const mode of ["day", "week", "all"] as ViewMode[]) {
            const value = payload[mode];
            if (Array.isArray(value)) next[mode] = value.filter((key) => OPTIONAL_COLUMNS.includes(key));
          }
          return next;
        });
      } catch {
        // Reading the preference is best-effort; defaults are already in place.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyColumns = (next: ColumnKey[]) => {
    setOptionalColumns(next);
    void preferencesApi.write(COLUMN_PREFERENCE_NAMESPACE, { ...optionalByView, [view]: next }).catch(() => undefined);
  };

  // Default the range to the full synced span once trades arrive.
  useEffect(() => {
    if (trades && trades.length > 0 && range.from === "") {
      setRange({ from: earliestDay, to: latestDay });
    }
  }, [trades, earliestDay, latestDay, range.from]);

  const queryKey = [view, accountIds.join(","), range.from, range.to, side, result, symbol].join("|");
  // The local filters resolve instantly; the wave still flashes briefly whenever
  // the queried data changes so the transition reads as intentional.
  useEffect(() => {
    const delay = loadedKey === null ? 700 : 420;
    const timer = setTimeout(() => setLoadedKey(queryKey), delay);
    return () => clearTimeout(timer);
  }, [queryKey, loadedKey]);
  const loading = fetching || trades === null || loadedKey !== queryKey;

  const symbols = useMemo(() => [...new Set((trades ?? []).map((trade) => trade.symbol))].sort(), [trades]);

  const filtered = useMemo(
    () =>
      (trades ?? []).filter(
        (trade) =>
          accountIds.includes(trade.accountId) &&
          (range.from === "" || inRange(trade, range.from, range.to)) &&
          matchSide(trade, side) &&
          matchResult(trade, result) &&
          (symbol === "all" || trade.symbol === symbol),
      ),
    [trades, accountIds, range, side, result, symbol],
  );

  const dayGroups = useMemo(() => groupByDay(filtered), [filtered]);
  const weekGroups = useMemo(() => groupByWeek(filtered), [filtered]);
  const overall = useMemo(() => computeStats(filtered), [filtered]);

  // The day view groups by day already, so the day column is hidden there.
  // Fixed columns are always present; the picker only toggles the optional ones.
  const viewColumns = useMemo(() => {
    // 交易日 only appears in the week view; day groups and the all view inline the date.
    const fixed = view === "week" ? FIXED_COLUMNS : FIXED_COLUMNS.filter((key) => key !== "date");
    return COLUMN_ORDER.filter((key) => fixed.includes(key) || optionalColumns.includes(key));
  }, [optionalColumns, view]);

  const resetPage = () => {
    setDayVisible(8);
    setWeekVisible(6);
    setPage(1);
  };

  // The divider only shows once the bar has actually pinned to the top.
  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const scroller = element.closest<HTMLElement>('[data-slot="dashboard-workspace"]');
    let frame = 0;
    const measure = () => {
      frame = 0;
      const barBox = element.getBoundingClientRect();
      const barTop = barBox.top;
      const containerTop = scroller ? scroller.getBoundingClientRect().top : 0;
      setToolbarStuck(barTop <= containerTop + 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const target: EventTarget = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const applyRange = (from: string, to: string) => {
    setRange({ from, to });
    resetPage();
  };

  // Fit the all view to the workspace so no leftover content can sit above the
  // table header. The offset is measured inside the scroll content, so it does
  // not depend on the current scroll position.
  useEffect(() => {
    if (view !== "all") return;
    const scroller = document.querySelector<HTMLElement>('[data-slot="dashboard-workspace"]');
    const body = bodyRef.current;
    if (!scroller || !body) return;
    const measure = () => {
      const bodyOffset = body.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setViewportBudget(Math.max(360, Math.round(scroller.clientHeight - bodyOffset - 16)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [view]);

  const toggleAccount = (accountId: string) => {
    setAccountIds((prev) => {
      // The page always keeps at least one live account in scope, so the last
      // selected chip cannot be switched off.
      if (prev.includes(accountId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== accountId);
      }
      return [...prev, accountId];
    });
    resetPage();
  };

  let body: ReactNode;
  if (fetchError) {
    body = <ErrorPanel t={t} onRetry={() => void loadData()} />;
  } else if (loading) {
    body = <LoadingWave t={t} />;
  } else if (accountIds.length === 0) {
    body = <NoAccountsPanel t={t} onSelectAll={() => setAccountIds([...scopeDefaults])} />;
  } else if (filtered.length === 0) {
    body = <EmptyPanel t={t} />;
  } else if (view === "day") {
    body = (
      <>
        {dayGroups.slice(0, dayVisible).map((group) => (
          <DayGroupCard key={group.key} group={group} columns={viewColumns} t={t} locale={locale} />
        ))}
        {dayVisible < dayGroups.length && (
          <LoadMore
            label={t.loadMore}
            remaining={dayGroups.length - dayVisible}
            onClick={() => setDayVisible((prev) => prev + 8)}
          />
        )}
      </>
    );
  } else if (view === "week") {
    body = (
      <>
        {weekGroups.slice(0, weekVisible).map((group) => (
          <WeekGroupCard key={group.key} group={group} columns={viewColumns} t={t} locale={locale} />
        ))}
        {weekVisible < weekGroups.length && (
          <LoadMore
            label={t.loadMore}
            remaining={weekGroups.length - weekVisible}
            onClick={() => setWeekVisible((prev) => prev + 6)}
          />
        )}
      </>
    );
  } else {
    body = (
      <AllView
        t={t}
        locale={locale}
        trades={filtered}
        stats={overall}
        columns={viewColumns}
        page={page}
        onPage={setPage}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
        <StatsScopeChip
          t={t}
          accounts={accounts}
          selectedIds={accountIds}
          onToggle={toggleAccount}
          onSelectAll={() => setAccountIds([...scopeDefaults])}
        />
      </header>

      {/* The view switch and filters stay pinned while the groups scroll. Negative
          margins let the bar bleed to the workspace edge so nothing peeks around it. */}
      <div
        ref={toolbarRef}
        className={`sticky -top-4 z-30 -mx-4 bg-background px-4 py-3 md:-top-6 md:-mx-6 md:px-6 lg:-mx-10 lg:px-10 xl:-mx-12 xl:px-12 ${
          toolbarStuck ? "border-b border-border/60" : ""
        }`}
      >
        <Toolbar
          t={t}
          locale={locale}
          view={view}
          onView={(next) => {
            setView(next);
            resetPage();
          }}
          range={range}
          onRange={applyRange}
          latestDay={latestDay}
          earliestDay={earliestDay}
          side={side}
          onSide={(next) => {
            setSide(next);
            resetPage();
          }}
          result={result}
          onResult={(next) => {
            setResult(next);
            resetPage();
          }}
          symbol={symbol}
          symbols={symbols}
          onSymbol={(next) => {
            setSymbol(next);
            resetPage();
          }}
          onOpenColumns={() => setColumnOpen(true)}
        />
      </div>

      {/* The All view drops the calendar rail so the table can use the full width. */}
      <div
        ref={bodyRef}
        style={view === "all" && viewportBudget > 0 ? { height: viewportBudget } : undefined}
        className={
          view === "all" ? "flex min-h-0 min-w-0 flex-col gap-4" : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">{body}</div>
        {view !== "all" && range.from !== "" && (
          <SideRail
            t={t}
            locale={locale}
            range={range}
            trades={filtered}
            view={view}
            onPickDay={(dayKey) => {
              if (view === "week") {
                const start = shanghaiWeekStart(dayKeyToEpoch(dayKey));
                setRange({ from: start, to: addDays(start, 6) });
              } else {
                setRange({ from: dayKey, to: dayKey });
                setView("day");
              }
              resetPage();
            }}
          />
        )}
      </div>

      <ColumnPickerDialog
        t={t}
        open={columnOpen}
        columns={optionalColumns}
        defaultColumns={DEFAULT_OPTIONAL_BY_VIEW[view]}
        onOpenChange={setColumnOpen}
        onApply={applyColumns}
      />
    </div>
  );
}

function StatsScopeChip({
  t,
  accounts,
  selectedIds,
  onToggle,
  onSelectAll,
}: {
  t: TradeCenterText;
  accounts: TradeAccount[];
  selectedIds: string[];
  onToggle: (accountId: string) => void;
  onSelectAll: () => void;
}) {
  // Only accounts the account module flagged for statistics take part in the
  // page scope, so the chips mirror the global statistics selection.
  const scoped = accounts.filter((account) => account.isStatistics);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">
        {t.accountScope}
        <span className="ml-1 tabular-nums text-foreground/70">
          {selectedIds.length}/{scoped.length}
        </span>
      </span>
      {scoped.map((account) => {
        const included = selectedIds.includes(account.id);
        return (
          <Tooltip key={account.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={included}
                onClick={() => onToggle(account.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  included
                    ? "border-primary/25 bg-primary/10 text-primary hover:bg-primary/18"
                    : "border-dashed border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {included ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                {account.name}
              </button>
            </TooltipTrigger>
            <TooltipContent>{included ? t.accountScopeExclude : t.accountScopeInclude}</TooltipContent>
          </Tooltip>
        );
      })}
      {selectedIds.length === 0 && (
        <button type="button" onClick={onSelectAll} className="text-sm font-medium text-primary hover:underline">
          {t.accountScopeAll}
        </button>
      )}
    </div>
  );
}

function NoAccountsPanel({ t, onSelectAll }: { t: TradeCenterText; onSelectAll: () => void }) {
  return (
    <Card className="items-center gap-3 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning">
        <Info className="size-5" />
      </span>
      <CardTitle className="text-base">{t.noAccountsTitle}</CardTitle>
      <p className="text-sm text-muted-foreground">{t.noAccountsDescription}</p>
      <Button variant="outline" size="sm" onClick={onSelectAll}>
        {t.accountScopeAll}
      </Button>
    </Card>
  );
}

function ErrorPanel({ t, onRetry }: { t: TradeCenterText; onRetry: () => void }) {
  return (
    <Card className="items-center gap-3 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-loss/10 text-loss">
        <TrendingDown className="size-5" />
      </span>
      <CardTitle className="text-base">{t.errorTitle}</CardTitle>
      <p className="text-sm text-muted-foreground">{t.errorDescription}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t.errorRetry}
      </Button>
    </Card>
  );
}

/** Page / data loading state: an animated waveform plus a short message. */
function LoadingWave({ t }: { t: TradeCenterText }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24">
      <div data-slot="loading-wave" className="flex h-16 items-center gap-2" aria-hidden>
        {bars.map((index) => (
          <span
            key={index}
            className="tradeez-loading-bar h-16 w-3 rounded-full bg-primary"
            style={{ animationDelay: `${(-index * 1.45) / bars.length}s` }}
          />
        ))}
      </div>
      <div className="text-center">
        <p className="text-xl font-semibold">{t.loadingTitle}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{t.loadingDescription}</p>
      </div>
    </div>
  );
}

function FilterGroupLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuLabel className="px-3 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </DropdownMenuLabel>
  );
}

function FilterOption({
  label,
  checked,
  onSelect,
  mono,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
  mono?: boolean;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="flex items-center gap-2.5 rounded-lg px-3 py-2">
      <Check className={`size-4 shrink-0 ${checked ? "text-primary" : "opacity-0"}`} />
      <span
        className={`truncate text-sm ${checked ? "font-medium text-primary" : ""} ${mono ? "font-mono text-xs" : ""}`}
      >
        {label}
      </span>
    </DropdownMenuItem>
  );
}

function Toolbar({
  t,
  locale,
  view,
  onView,
  range,
  onRange,
  latestDay,
  earliestDay,
  side,
  onSide,
  result,
  onResult,
  symbol,
  symbols,
  onSymbol,
  onOpenColumns,
}: {
  t: TradeCenterText;
  locale: Locale;
  view: ViewMode;
  onView: (view: ViewMode) => void;
  range: { from: string; to: string };
  onRange: (from: string, to: string) => void;
  latestDay: string;
  earliestDay: string;
  side: SideFilter;
  onSide: (side: SideFilter) => void;
  result: ResultFilter;
  onResult: (result: ResultFilter) => void;
  symbol: string;
  symbols: string[];
  onSymbol: (symbol: string) => void;
  onOpenColumns: () => void;
}) {
  const views: { key: ViewMode; label: string }[] = [
    { key: "day", label: t.viewDay },
    { key: "week", label: t.viewWeek },
    { key: "all", label: t.viewAll },
  ];
  const filtersActive = side !== "all" || result !== "all" || symbol !== "all";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex items-center gap-1 rounded-lg bg-[#eeedf8] p-1">
        {views.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onView(item.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              view === item.key ? "bg-[#dfdaf0] text-foreground" : "text-[#7d7a8c] hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t.columns} onClick={onOpenColumns}>
              <Columns3 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t.columns}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={filtersActive ? "secondary" : "outline"} className="gap-1.5 font-normal">
              {t.filters}
              {filtersActive && <span className="size-1.5 rounded-full bg-primary" />}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-72 rounded-xl p-2 shadow-[0_14px_36px_rgb(32_20_61_/_16%)]"
          >
            <FilterGroupLabel>{t.filterDirection}</FilterGroupLabel>
            <FilterOption label={t.filterAll} checked={side === "all"} onSelect={() => onSide("all")} />
            <FilterOption label={t.sideBuy} checked={side === "buy"} onSelect={() => onSide("buy")} />
            <FilterOption label={t.sideSell} checked={side === "sell"} onSelect={() => onSide("sell")} />
            <DropdownMenuSeparator className="my-1.5" />
            <FilterGroupLabel>{t.filterResult}</FilterGroupLabel>
            <FilterOption label={t.filterAll} checked={result === "all"} onSelect={() => onResult("all")} />
            <FilterOption label={t.resultWin} checked={result === "win"} onSelect={() => onResult("win")} />
            <FilterOption label={t.resultLoss} checked={result === "loss"} onSelect={() => onResult("loss")} />
            <DropdownMenuSeparator className="my-1.5" />
            <FilterGroupLabel>{t.filterSymbol}</FilterGroupLabel>
            <div className="max-h-56 overflow-y-auto">
              <FilterOption label={t.filterAll} checked={symbol === "all"} onSelect={() => onSymbol("all")} />
              {symbols.map((name) => (
                <FilterOption key={name} label={name} mono checked={symbol === name} onSelect={() => onSymbol(name)} />
              ))}
            </div>
            {filtersActive && (
              <>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuItem
                  className="justify-center rounded-lg text-sm text-muted-foreground"
                  onSelect={() => {
                    onSide("all");
                    onResult("all");
                    onSymbol("all");
                  }}
                >
                  {t.filterClear}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <RangeControl
          t={t}
          locale={locale}
          range={range}
          onRange={onRange}
          latestDay={latestDay}
          earliestDay={earliestDay}
        />
      </div>
    </div>
  );
}

function RangeControl({
  t,
  locale,
  range,
  onRange,
  latestDay,
  earliestDay,
}: {
  t: TradeCenterText;
  locale: Locale;
  range: { from: string; to: string };
  onRange: (from: string, to: string) => void;
  latestDay: string;
  earliestDay: string;
}) {
  const [open, setOpen] = useState(false);
  // With no synced trades there is no meaningful range to pick from.
  if (!latestDay) {
    return (
      <Button variant="outline" className="gap-1.5 font-normal opacity-60" disabled>
        <CalendarDays className="size-4 text-muted-foreground" />
        {t.presetAll}
      </Button>
    );
  }
  const prevMonthDay = addDays(monthStart(latestDay), -1);
  const presets: { label: string; range: { from: string; to: string } }[] = [
    { label: t.presetAll, range: { from: earliestDay, to: latestDay } },
    { label: t.presetToday, range: { from: latestDay, to: latestDay } },
    { label: t.presetThisWeek, range: { from: shanghaiWeekStart(dayKeyToEpoch(latestDay)), to: latestDay } },
    { label: t.presetThisMonth, range: { from: monthStart(latestDay), to: latestDay } },
    { label: t.presetLast30, range: { from: addDays(latestDay, -29), to: latestDay } },
    { label: t.presetLastMonth, range: { from: monthStart(prevMonthDay), to: monthEnd(prevMonthDay) } },
    { label: t.presetThisQuarter, range: { from: quarterStart(latestDay), to: latestDay } },
    { label: t.presetYtd, range: { from: `${latestDay.slice(0, 4)}-01-01`, to: latestDay } },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-1.5 font-normal">
          <CalendarDays className="size-4 text-muted-foreground" />
          {range.from ? formatRangeLabel(range.from, range.to, locale) : t.presetAll}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex">
          <div className="border-r p-3">
            <RangeCalendar from={range.from} to={range.to} locale={locale} onPick={onRange} />
          </div>
          <div className="flex w-40 flex-col gap-0.5 p-3">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  onRange(preset.range.from, preset.range.to);
                  setOpen(false);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RangeCalendar({
  from,
  to,
  locale,
  onPick,
}: {
  from: string;
  to: string;
  locale: Locale;
  onPick: (from: string, to: string) => void;
}) {
  const [anchor, setAnchor] = useState<string | null>(null);
  // Open on the range end: with the default "all data" scope the start month is
  // years back, and paging forward from there would be tedious.
  const [cursor, setCursor] = useState(to.slice(0, 7));
  const months = [cursor, monthKeyShift(cursor, 1)];
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

  const pickDay = (dayKey: string) => {
    if (!anchor) {
      setAnchor(dayKey);
      onPick(dayKey, dayKey);
      return;
    }
    if (dayKey < anchor) onPick(dayKey, anchor);
    else onPick(anchor, dayKey);
    setAnchor(null);
  };

  return (
    <div className="flex gap-6">
      {months.map((monthKey, index) => {
        const first = monthStart(monthKey);
        const totalDays = Number(monthEnd(monthKey).slice(8, 10));
        const leading = (new Date(`${first}T00:00:00.000Z`).getUTCDay() + 6) % 7;
        const cells: { id: string; dayKey: string | null }[] = [];
        for (let i = 0; i < leading; i += 1) cells.push({ id: `${monthKey}-pad-${i}`, dayKey: null });
        for (let d = 1; d <= totalDays; d += 1) {
          const dayKey = `${monthKey}-${String(d).padStart(2, "0")}`;
          cells.push({ id: dayKey, dayKey });
        }
        while (cells.length % 7 !== 0) cells.push({ id: `${monthKey}-tail-${cells.length}`, dayKey: null });

        return (
          <div key={monthKey} className="w-56">
            <div className="mb-2 flex items-center justify-between">
              {index === 0 ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="prev"
                  onClick={() => setCursor(monthKeyShift(cursor, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
              ) : (
                <span className="size-8" />
              )}
              <span className="text-sm font-semibold">{formatMonthLabel(monthKey, locale)}</span>
              {index === months.length - 1 ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="next"
                  onClick={() => setCursor(monthKeyShift(cursor, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              ) : (
                <span className="size-8" />
              )}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-muted-foreground">
              {weekdays.map((label) => (
                <span key={label} className="py-1">
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
              {cells.map((slot) => {
                const dayKey = slot.dayKey;
                if (!dayKey) return <span key={slot.id} />;
                const selected = dayKey === from || dayKey === to;
                const between = dayKey > from && dayKey < to;
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => pickDay(dayKey)}
                    className={`mx-auto flex size-8 items-center justify-center rounded-full transition-colors ${rangeDayClass(selected, between)}`}
                  >
                    {Number(dayKey.slice(8, 10))}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Trend + stats block shared by the day card and the week cell dialog. */
function DayCharts({ group, t, locale }: { group: DayGroup; t: TradeCenterText; locale: Locale }) {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <DayTrendChart series={group.series} trades={group.trades} t={t} locale={locale} />
      <div className="mx-auto w-full max-w-3xl">
        <StatGrid stats={group.stats} t={t} locale={locale} />
      </div>
    </div>
  );
}

function DayGroupCard({
  group,
  columns,
  t,
  locale,
}: {
  group: DayGroup;
  columns: ColumnKey[];
  t: TradeCenterText;
  locale: Locale;
}) {
  // Collapsing a day hides only the trade table; stats and icons stay visible.
  const [tableOpen, setTableOpen] = useState(true);
  return (
    <Card className="gap-0 overflow-hidden pt-0 pb-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setTableOpen((prev) => !prev)}
          aria-expanded={tableOpen}
          aria-label={formatDayLabel(group.key, locale)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted"
        >
          <ChevronRight
            className={`size-4 text-muted-foreground transition-transform ${tableOpen ? "rotate-90" : ""}`}
          />
        </button>
        <span className="text-base font-semibold">{formatDayHeader(group.key, locale)}</span>
        <span className="flex items-center gap-1.5 text-base">
          <span className="text-muted-foreground">{t.netPnl}</span>
          <span className={`font-semibold tabular-nums ${toneClass(group.stats.net)}`}>
            {formatMoney(group.stats.net, locale)}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <IconGhost label={t.note} icon={<StickyNote className="size-4" />} />
          <IconGhost label={t.replay} icon={<Play className="size-4" />} />
        </span>
      </div>
      <div className="flex flex-col gap-6 px-5 pt-3 pb-5">
        <DayCharts group={group} t={t} locale={locale} />
        {tableOpen && (
          <div className="overflow-hidden rounded-lg border">
            <TradeTable trades={group.trades} columns={columns} t={t} locale={locale} compact />
          </div>
        )}
      </div>
    </Card>
  );
}

function WeekGroupCard({
  group,
  columns,
  t,
  locale,
}: {
  group: WeekGroup;
  columns: ColumnKey[];
  t: TradeCenterText;
  locale: Locale;
}) {
  const [tableOpen, setTableOpen] = useState(true);
  const [openDay, setOpenDay] = useState<DayGroup | null>(null);
  const bars = group.days.map((day) => ({ ...day, label: formatWeekday(day.key, locale) }));
  const openDayDetail = (dayKey: string) => {
    const dayTrades = group.trades.filter((trade) => shanghaiDayKey(trade.closeTime) === dayKey);
    setOpenDay({
      key: dayKey,
      weekday: new Date(`${dayKey}T00:00:00.000Z`).getUTCDay(),
      trades: [...dayTrades].sort((a, b) => b.closeTime - a.closeTime),
      stats: computeStats(dayTrades),
      series: cumulativeSeries(dayTrades),
    });
  };
  return (
    <Card className="gap-0 overflow-hidden pt-0 pb-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setTableOpen((prev) => !prev)}
          aria-expanded={tableOpen}
          className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted"
        >
          <ChevronRight
            className={`size-4 text-muted-foreground transition-transform ${tableOpen ? "rotate-90" : ""}`}
          />
        </button>
        <span className="text-base font-semibold">{formatWeekRange(group.start, group.end, locale)}</span>
        <span className="flex items-center gap-1.5 text-base">
          <span className="text-muted-foreground">{t.netPnl}</span>
          <span className={`font-semibold tabular-nums ${toneClass(group.stats.net)}`}>
            {formatMoney(group.stats.net, locale)}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <IconGhost label={t.note} icon={<StickyNote className="size-4" />} />
          <IconGhost label={t.replay} icon={<Play className="size-4" />} />
        </span>
      </div>
      <div className="flex flex-col gap-6 border-t p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {group.days.map((day) => (
            <WeekDayCell key={day.key} day={day} t={t} locale={locale} onOpen={() => openDayDetail(day.key)} />
          ))}
        </div>
        <div className="grid items-center gap-6 lg:grid-cols-[38%_minmax(0,1fr)]">
          <DailyChart bars={bars} locale={locale} />
          <div className="flex flex-col gap-4">
            <StatGrid stats={group.stats} t={t} locale={locale} />
            <div className="border-t pt-4">
              <ScaleBar stats={group.stats} t={t} locale={locale} />
            </div>
          </div>
        </div>
        {tableOpen && (
          <div className="overflow-hidden rounded-lg border">
            <TradeTable trades={group.trades} columns={columns} t={t} locale={locale} compact />
          </div>
        )}
      </div>
      <DayDetailDialog day={openDay} columns={columns} t={t} locale={locale} onClose={() => setOpenDay(null)} />
    </Card>
  );
}

function WeekDayCell({
  day,
  t,
  locale,
  onOpen,
}: {
  day: { key: string; net: number; count: number };
  t: TradeCenterText;
  locale: Locale;
  onOpen: () => void;
}) {
  const empty = day.count === 0;
  const profit = day.net >= 0;
  const tone = weekDayCellTone(day.count, day.net);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex flex-col gap-1.5 rounded-lg border border-transparent px-3 py-2.5 text-right transition-colors ${tone}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="pt-0.5">
          {!empty &&
            (profit ? <TrendingUp className="size-4 text-profit" /> : <TrendingDown className="size-4 text-loss" />)}
        </span>
        <span className="text-xs text-muted-foreground">{formatWeekdayDate(day.key, locale)}</span>
      </span>
      {/* Days without trades show only the date — no placeholder amount or count. */}
      {!empty && (
        <>
          <span className={`text-lg font-semibold tabular-nums ${toneClass(day.net)}`}>
            {formatMoney(day.net, locale)}
          </span>
          <span className="text-xs text-muted-foreground">
            {day.count} {t.tradesUnit}
          </span>
        </>
      )}
    </button>
  );
}

function DayDetailDialog({
  day,
  columns,
  t,
  locale,
  onClose,
}: {
  day: DayGroup | null;
  columns: ColumnKey[];
  t: TradeCenterText;
  locale: Locale;
  onClose: () => void;
}) {
  if (!day) return null;
  // A single day does not need the redundant day column.
  const dialogColumns = columns.filter((key) => key !== "date");
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[96vw] sm:max-w-[1480px]">
        <DialogHeader className="gap-1">
          <DialogTitle className="flex flex-wrap items-baseline gap-3 text-base">
            <span>{formatDayHeader(day.key, locale)}</span>
            <span className="flex items-baseline gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">{t.netPnl}</span>
              <span className={`text-base font-semibold tabular-nums ${toneClass(day.stats.net)}`}>
                {formatMoney(day.stats.net, locale)}
              </span>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">{formatDayLong(day.key, locale)}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto px-1">
          <DayCharts group={day} t={t} locale={locale} />
          <div className="px-2 pt-3">
            <div className="overflow-hidden rounded-lg border">
              <TradeTable trades={day.trades} columns={dialogColumns} t={t} locale={locale} compact />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllView({
  t,
  locale,
  trades,
  stats,
  columns,
  page,
  onPage,
}: {
  t: TradeCenterText;
  locale: Locale;
  trades: MockTrade[];
  stats: TradeStats;
  columns: ColumnKey[];
  page: number;
  onPage: (page: number) => void;
}) {
  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(trades.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  const rows = trades.slice(start, start + pageSize);
  const ordered = useMemo(() => [...trades].sort((a, b) => a.closeTime - b.closeTime), [trades]);
  const series = useMemo(() => cumulativeSeries(trades), [trades]);
  const grossTotal = stats.winSum + stats.lossSum;
  const winShare = grossTotal > 0 ? stats.winSum / grossTotal : 0.5;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          t={t}
          title={t.cumulativeNet}
          tip={t.tipCumulative}
          value={<span className={toneClass(stats.net)}>{formatMoney(stats.net, locale)}</span>}
          footer={`${stats.count} ${t.tradesUnit}`}
        >
          <DayTrendChart series={series} trades={ordered} t={t} locale={locale} compact />
        </MetricCard>
        <MetricCard
          t={t}
          title={t.profitFactor}
          tip={t.tipProfitFactor}
          value={stats.profitFactor === null ? t.na : stats.profitFactor.toFixed(2)}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-[92px] flex-col items-center justify-center gap-1.5">
                <DonutStat
                  greenShare={winShare}
                  label={stats.profitFactor === null ? t.na : stats.profitFactor.toFixed(2)}
                />
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="text-profit">{formatMoney(stats.winSum, locale)}</span>
                  <span className="text-loss">{formatMoney(-stats.lossSum, locale)}</span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-0.5">
                <span>
                  {t.winTotal} {formatMoney(stats.winSum, locale)}
                </span>
                <span>
                  {t.lossTotal} {formatMoney(-stats.lossSum, locale)}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        </MetricCard>
        <MetricCard t={t} title={t.winRate} tip={t.tipWinRate} value={formatPercent(stats.winRate * 100, locale)}>
          <WinRateStats stats={stats} t={t} locale={locale} />
        </MetricCard>
        <MetricCard
          t={t}
          title={t.avgWinLoss}
          tip={
            <div className="flex flex-col gap-1">
              <span>{t.tipAvgWinLossCaliber}</span>
              <span>{t.tipAvgWinLossR}</span>
            </div>
          }
          value={stats.avgWin && stats.avgLoss ? (stats.avgWin / stats.avgLoss).toFixed(2) : t.na}
        >
          <AvgWinLossBar stats={stats} t={t} locale={locale} />
        </MetricCard>
      </div>

      {/* Fills the remaining viewport height so only the table body scrolls. */}
      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden pt-0 pb-3">
        <CardHeader
          className="flex flex-row items-center justify-between py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <CardTitle className="text-base font-bold">
            {t.rowsRange
              .replace("{from}", trades.length === 0 ? "0" : String(start + 1))
              .replace("{to}", String(Math.min(start + pageSize, trades.length)))
              .replace("{total}", String(trades.length))}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t.pagination.replace("{page}", String(current)).replace("{totalPages}", String(totalPages))}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t.prevPage}
              disabled={current <= 1}
              onClick={() => onPage(current - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t.nextPage}
              disabled={current >= totalPages}
              onClick={() => onPage(current + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-1.5 font-normal">
                  <Download className="size-4" />
                  {t.bulkActions}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="cursor-pointer" disabled>
                  <Check /> {t.bulkReview}
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" disabled>
                  <Download /> {t.bulkExport}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <div className="min-h-0 flex-1 px-4 pt-2 pb-1">
          <div className="h-full overflow-hidden rounded-lg border">
            <TradeTable trades={rows} columns={columns} t={t} locale={locale} selectable dateInline stickyHeader />
          </div>
        </div>
      </Card>
    </>
  );
}

function MetricCard({
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

/** Small ⓘ affordance that reveals a metric's definition on hover. */
function InfoTip({ label, text, size = "size-3.5" }: { label: string; text: ReactNode; size?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <Info className={size} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function StatGrid({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
  const cells: { label: string; value: ReactNode; tip?: string }[] = [
    { label: t.totalTrades, value: stats.count, tip: t.tipTotalTrades },
    {
      label: t.grossPnl,
      value: <span className={toneClass(stats.gross)}>{formatMoney(stats.gross, locale)}</span>,
      tip: t.tipGrossPnl,
    },
    { label: t.winnersLosers, value: `${stats.winners} / ${stats.losers}` },
    {
      label: t.swaps,
      value: <span className={toneClass(stats.swap)}>{formatMoney(stats.swap, locale)}</span>,
      tip: t.tipSwaps,
    },
    { label: t.winRate, value: formatPercent(stats.winRate * 100, locale), tip: t.tipWinRate },
    {
      label: t.volume,
      value: stats.volume.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
            {cell.tip && <InfoTip label={cell.label} text={cell.tip} size="size-3" />}
          </span>
          <span className="text-xl font-semibold tabular-nums">{cell.value}</span>
        </div>
      ))}
    </div>
  );
}

function ScaleBar({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
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
          <span className="text-sm font-medium tabular-nums text-loss">{formatMoney(stats.netTrough, locale)}</span>
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
          <span className="text-sm font-medium tabular-nums text-profit">{formatMoney(stats.netPeak, locale)}</span>
        </div>
      </div>
    </div>
  );
}

function AvgWinLossBar({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
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
              <span className="tabular-nums text-profit">{formatMoney(win, locale)}</span>
              <span className="tabular-nums text-loss">{formatMoney(loss, locale)}</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0.5">
            <span>
              {t.resultWin} {formatMoney(win, locale)}
            </span>
            <span>
              {t.resultLoss} {formatMoney(loss, locale)}
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
function DonutStat({ greenShare, label }: { greenShare: number; label: string }) {
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
function WinRateStats({ stats, t, locale }: { stats: TradeStats; t: TradeCenterText; locale: Locale }) {
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
              {t.resultWin} {stats.winners}
            </span>
            <span>
              {t.resultFlat} {stats.breakeven}
            </span>
            <span>
              {t.resultLoss} {stats.losers}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <span className="rounded-full bg-profit-soft px-2 py-0.5 text-profit">{stats.winners}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{stats.breakeven}</span>
        <span className="rounded-full bg-loss-soft px-2 py-0.5 text-loss">{stats.losers}</span>
      </div>
    </div>
  );
}

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

/**
 * Split the running P&L into a positive and a negative series. A zero-crossing
 * is inserted between samples so the green and red blocks meet exactly on the
 * zero line instead of overlapping into each other.
 */
function buildTrendData(series: CurvePoint[]): TrendPoint[] {
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
        <span className={toneClass(point.value)}>{formatMoney(point.value, locale)}</span>
      </div>
    </div>
  );
}

function DayTrendChart({
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
              tick={{ fontSize: 12, fill: "#8b8b96" }}
              tickFormatter={(value: number) => formatMoneyCompact(value, locale)}
            />
          )}
          <ReferenceLine y={0} stroke="#d9d4e8" />
          <RechartsTooltip
            cursor={{ stroke: "#d9d4e8", strokeDasharray: "3 3" }}
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
            activeDot={{ r: 4.5, fill: LINE_COLOR, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface WeekBar {
  key: string;
  net: number;
  count: number;
  label: string;
}

function DailyTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { payload: WeekBar }[];
  locale: Locale;
}) {
  const bar = payload?.[0]?.payload;
  if (!active || !bar) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-[0_10px_26px_rgb(32_20_61_/_16%)]">
      <div className="text-sm font-semibold">{bar.label}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="size-2.5 rounded-[3px]" style={{ background: bar.net >= 0 ? PROFIT_SOLID : LOSS_SOLID }} />
        <span>
          {bar.label}: {formatMoney(bar.net, locale)}
        </span>
      </div>
    </div>
  );
}

function DailyChart({ bars, locale }: { bars: WeekBar[]; locale: Locale }) {
  return (
    <div className="h-[190px] w-full min-w-0 overflow-hidden border-0 [&_*:focus-visible]:outline-none [&_*:focus]:outline-none">
      <ResponsiveContainer width="100%" height={190} initialDimension={{ width: 320, height: 190 }}>
        <ComposedChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#8b8b96" }}
            interval={0}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            padding={{ top: 14, bottom: 14 }}
            tick={{ fontSize: 11, fill: "#8b8b96" }}
            tickFormatter={(value: number) => formatMoneyCompact(value, locale)}
          />
          <ReferenceLine y={0} stroke="#d9d4e8" />
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

function TradeTable({
  trades,
  columns,
  t,
  locale,
  compact,
  selectable,
  dateInline,
  stickyHeader,
}: {
  trades: MockTrade[];
  columns: ColumnKey[];
  t: TradeCenterText;
  locale: Locale;
  compact?: boolean;
  selectable?: boolean;
  dateInline?: boolean;
  stickyHeader?: boolean;
}) {
  const [sort, setSort] = useState<{ key: ColumnKey; dir: "asc" | "desc" } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return trades;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...trades].sort((a, b) => compareTrade(a, b, sort.key) * factor);
  }, [trades, sort]);

  const toggleSort = (key: ColumnKey) => {
    if (!SORTABLE_COLUMNS.includes(key)) return;
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  };

  return (
    <Table className="w-full table-fixed" containerClassName={stickyHeader ? "h-full overflow-y-auto" : undefined}>
      <colgroup>
        {selectable && <col style={{ width: 44 }} />}
        {columns.map((key) => (
          <col key={key} style={{ width: columnWidth(key, Boolean(dateInline)) }} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
          {selectable && <TableHead className={`h-9 w-10 ${stickyHeader ? "sticky top-0 z-10 bg-muted" : ""}`} />}
          {columns.map((key) => {
            const sortable = SORTABLE_COLUMNS.includes(key);
            const active = sort?.key === key;
            const align = COLUMN_META[key].align;
            return (
              <TableHead
                key={key}
                className={`group/head h-9 font-bold whitespace-nowrap ${alignClass(align)} ${
                  stickyHeader ? "sticky top-0 z-10 bg-muted" : ""
                }`}
                aria-sort={ariaSortState(active, sort?.dir)}
              >
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                  >
                    {columnLabel(key, t)}
                    <span
                      className={`transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover/head:opacity-100"}`}
                    >
                      <SortIcon active={active} dir={sort?.dir} />
                    </span>
                  </button>
                ) : (
                  columnLabel(key, t)
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((trade) => (
          <TableRow key={trade.id} className="border-b border-[#e8e5f0] transition-colors hover:bg-muted/25">
            {selectable && (
              <TableCell className="w-10">
                <Checkbox aria-label={t.selectRow} />
              </TableCell>
            )}
            {columns.map((key) => (
              <TableCell
                key={key}
                className={`whitespace-nowrap ${compact ? "py-2" : ""} ${alignClass(COLUMN_META[key].align)}`}
              >
                {tradeCell(trade, key, t, locale, Boolean(dateInline))}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function columnLabel(key: ColumnKey, t: TradeCenterText): string {
  const map: Record<ColumnKey, string> = {
    date: t.colDate,
    closeTime: t.colCloseTime,
    openTime: t.colOpenTime,
    side: t.colSide,
    symbol: t.colSymbol,
    volume: t.colVolume,
    entry: t.colEntry,
    exit: t.colExit,
    slTp: t.colSlTp,
    net: t.colNet,
    rr: t.colRr,
    points: t.colPoints,
    swap: t.colSwap,
    commission: t.colCommission,
    duration: t.colDuration,
    account: t.colAccount,
    strategy: t.colStrategy,
  };
  return map[key];
}

function tradeCell(
  trade: MockTrade,
  key: ColumnKey,
  t: TradeCenterText,
  locale: Locale,
  dateInline = false,
): ReactNode {
  switch (key) {
    case "date":
      return <span className="text-muted-foreground">{formatShortDay(shanghaiDayKey(trade.closeTime), locale)}</span>;
    case "closeTime":
      return <span>{dateInline ? formatDateTime(trade.closeTime, locale) : formatClock(trade.closeTime, locale)}</span>;
    case "openTime":
      return <span>{dateInline ? formatDateTime(trade.openTime, locale) : formatClock(trade.openTime, locale)}</span>;
    case "side":
      return trade.side === "buy" ? (
        <Badge className="border-[#c3e7d8] bg-profit-soft text-profit" variant="outline">
          {t.sideBuy}
        </Badge>
      ) : (
        <Badge className="border-[#f6c9c9] bg-loss-soft text-loss" variant="outline">
          {t.sideSell}
        </Badge>
      );
    case "symbol":
      return <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold">{trade.symbol}</span>;
    case "volume":
      return <span className="tabular-nums">{trade.volume.toFixed(2)}</span>;
    case "entry":
      return (
        <span className="tabular-nums">{trade.openPrice === null ? t.na : formatPrice(trade.openPrice, locale)}</span>
      );
    case "exit":
      return <span className="tabular-nums">{formatPrice(trade.closePrice, locale)}</span>;
    case "slTp":
      return (
        <span className="tabular-nums text-muted-foreground">
          {trade.slPrice === null ? t.na : formatPrice(trade.slPrice, locale)} /{" "}
          {trade.tpPrice === null ? t.na : formatPrice(trade.tpPrice, locale)}
        </span>
      );
    case "net":
      return (
        <span className={`font-semibold tabular-nums ${toneClass(trade.netPnl)}`}>
          {formatMoney(trade.netPnl, locale)}
        </span>
      );
    case "rr":
      return (
        <span
          className={`tabular-nums ${trade.rMultiple === null ? "text-muted-foreground" : toneClass(trade.rMultiple)}`}
        >
          {trade.rMultiple === null ? t.na : `${formatSigned(trade.rMultiple, 2, locale)}R`}
        </span>
      );
    case "points":
      return (
        <span className={`tabular-nums ${trade.points === null ? "text-muted-foreground" : toneClass(trade.points)}`}>
          {trade.points === null ? t.na : formatSigned(trade.points, trade.points % 1 === 0 ? 0 : 1, locale)}
        </span>
      );
    case "swap":
      return <span className={`tabular-nums ${toneClass(trade.swap)}`}>{formatMoney(trade.swap, locale)}</span>;
    case "commission":
      return (
        <span className={`tabular-nums ${toneClass(trade.commission)}`}>{formatMoney(trade.commission, locale)}</span>
      );
    case "duration":
      return <span className="text-muted-foreground">{formatDuration(trade.durationSec, t)}</span>;
    case "account":
      return <span className="text-muted-foreground">{trade.accountName}</span>;
    case "strategy":
      return <span className="text-muted-foreground">{trade.strategy ?? t.strategyNone}</span>;
    default:
      return null;
  }
}

function ColumnPickerDialog({
  t,
  open,
  columns,
  defaultColumns,
  onOpenChange,
  onApply,
}: {
  t: TradeCenterText;
  open: boolean;
  columns: ColumnKey[];
  defaultColumns: ColumnKey[];
  onOpenChange: (open: boolean) => void;
  onApply: (columns: ColumnKey[]) => void;
}) {
  const [draft, setDraft] = useState<ColumnKey[]>(columns);
  const [query, setQuery] = useState("");

  // The toolbar opens the dialog directly, so reseed the draft from the active
  // view's columns every time it opens instead of trusting the mount value.
  useEffect(() => {
    if (!open) return;
    setDraft(columns);
    setQuery("");
  }, [open, columns]);

  const labels = new Map<ColumnKey, string>();
  for (const key of OPTIONAL_COLUMNS) labels.set(key, columnLabel(key, t));

  const visible = OPTIONAL_COLUMNS.filter((key) =>
    (labels.get(key) ?? "").toLowerCase().includes(query.trim().toLowerCase()),
  );
  const allSelected = draft.length === OPTIONAL_COLUMNS.length;

  const toggle = (key: ColumnKey) => {
    setDraft((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.columnsTitle}</DialogTitle>
          <DialogDescription>{t.columnsDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.columnsSearch}
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={() => setDraft(defaultColumns)}>
            {t.columnsDefault}
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <button
            type="button"
            aria-pressed={allSelected}
            className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
            onClick={() => setDraft(allSelected ? [] : [...OPTIONAL_COLUMNS])}
          >
            <CheckMark checked={allSelected} />
            <span className="text-sm font-semibold">{t.columnsSelectAll}</span>
          </button>
          {visible.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={draft.includes(key)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
              onClick={() => toggle(key)}
            >
              <CheckMark checked={draft.includes(key)} />
              <span className="text-sm">{labels.get(key)}</span>
            </button>
          ))}
          {visible.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">{t.columnsEmpty}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button
            onClick={() => {
              onApply(OPTIONAL_COLUMNS.filter((key) => draft.includes(key)));
              onOpenChange(false);
            }}
          >
            {t.update}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SideRail({
  t,
  locale,
  range,
  trades,
  view,
  onPickDay,
}: {
  t: TradeCenterText;
  locale: Locale;
  range: { from: string; to: string };
  trades: MockTrade[];
  view: ViewMode;
  onPickDay: (dayKey: string) => void;
}) {
  const [cursor, setCursor] = useState(range.to.slice(0, 7));
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);
  useEffect(() => {
    setCursor(range.to.slice(0, 7));
  }, [range.to]);
  // Cells are computed for the month currently on screen, so paging the calendar shows that month's days.
  const calendar = useMemo(() => calendarCells(trades, cursor), [trades, cursor]);
  const first = monthStart(cursor);
  const totalDays = Number(monthEnd(cursor).slice(8, 10));
  const leading = (new Date(`${first}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const slots: { id: string; dayKey: string | null }[] = [];
  for (let i = 0; i < leading; i += 1) slots.push({ id: `${cursor}-pad-${i}`, dayKey: null });
  for (let d = 1; d <= totalDays; d += 1) {
    const dayKey = `${cursor}-${String(d).padStart(2, "0")}`;
    slots.push({ id: dayKey, dayKey });
  }
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <aside className="flex flex-col gap-4 self-start xl:sticky xl:top-14">
      <Card className="gap-3 pt-4 pb-4">
        <CardHeader className="flex flex-row items-center justify-between py-0">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.prevMonth}
            onClick={() => setCursor(monthKeyShift(cursor, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <CardTitle className="text-sm font-bold">{formatMonthLabel(cursor, locale)}</CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.nextMonth}
            onClick={() => setCursor(monthKeyShift(cursor, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-muted-foreground">
            {weekdays.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-x-0.5 gap-y-1">
            {slots.map((slot) => {
              const dayKey = slot.dayKey;
              if (!dayKey) return <span key={slot.id} className="aspect-square" />;
              const dayCell = calendar.get(dayKey);
              // Only days that actually have trades get the soft highlight.
              const hasTrades = dayCell !== undefined;
              const picked = range.from === range.to && dayKey === range.from;
              const amount = dayCell ? formatMoneyCompact(dayCell.net, locale) : "";
              // In the week view, hovering one day highlights the whole week it belongs to.
              const weekKey = shanghaiWeekStart(dayKeyToEpoch(dayKey));
              const weekHovered = view === "week" && hoveredWeek === weekKey;
              const cellButton = (
                <button
                  type="button"
                  onClick={() => onPickDay(dayKey)}
                  onMouseEnter={() => setHoveredWeek(weekKey)}
                  onMouseLeave={() => setHoveredWeek(null)}
                  aria-label={formatDayLong(dayKey, locale)}
                  className={`relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-md transition-colors hover:bg-primary/10 ${calendarCellTone(
                    weekHovered,
                    hasTrades,
                  )} ${picked ? "ring-1 ring-primary" : ""}`}
                >
                  <span
                    className={`text-xs leading-none font-semibold tabular-nums ${calendarNumberClass(dayCell?.net)}`}
                  >
                    {Number(dayKey.slice(8, 10))}
                  </span>
                  {/* Days without trades keep the same two-line height so the grid stays even. */}
                  <span
                    className={`mt-1 h-3 leading-none font-medium tabular-nums ${amount.length > 6 ? "text-[9px]" : "text-[10px]"}`}
                    style={dayCell ? { color: toneColor(dayCell.net) } : undefined}
                  >
                    {amount}
                  </span>
                </button>
              );
              // A day with no trades gets no tooltip at all.
              if (!dayCell) return <span key={dayKey}>{cellButton}</span>;
              return (
                <Tooltip key={dayKey}>
                  <TooltipTrigger asChild>{cellButton}</TooltipTrigger>
                  <TooltipContent side="bottom" className="px-3 py-2">
                    <div className="text-sm font-semibold">{formatDayLong(dayKey, locale)}</div>
                    <div className="mt-1.5 flex items-stretch gap-2">
                      <span className="w-[3px] rounded-full" style={{ background: toneColor(dayCell.net) }} />
                      <div className="text-xs leading-relaxed">
                        <div>
                          {t.pnlLabel}: {formatMoney(dayCell.net, locale)}
                        </div>
                        <div>
                          {dayCell.count} {t.tradesUnit}
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function IconGhost({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
      {icon}
      {label}
    </span>
  );
}

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
      }`}
    >
      {checked && <Check className="size-3" />}
    </span>
  );
}

function LoadMore({ label, remaining, onClick }: { label: string; remaining: number; onClick: () => void }) {
  return (
    <Button variant="outline" className="w-full" onClick={onClick}>
      {label} ({remaining})
    </Button>
  );
}

function EmptyPanel({ t }: { t: TradeCenterText }) {
  return (
    <Card className="items-center gap-2 py-16 text-center">
      <CardTitle className="text-base">{t.emptyTitle}</CardTitle>
      <p className="text-sm text-muted-foreground">{t.emptyDescription}</p>
    </Card>
  );
}
