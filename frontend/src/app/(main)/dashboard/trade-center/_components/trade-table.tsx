"use client";

import { type ReactNode, useCallback, useMemo, useState } from "react";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import { SymbolBadge } from "@/components/shared/symbol-badge";
import { TradeSideBadge } from "@/components/shared/trade-side-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import { type MockTrade, shanghaiDayKey } from "@/lib/tradesync/trades-mock";

import {
  alignClass,
  COLUMN_META,
  type ColumnKey,
  columnWidth,
  compareTrade,
  formatClock,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPrice,
  formatShortDay,
  formatSigned,
  SORTABLE_COLUMNS,
  toneClass,
} from "../_lib/trade-center-model";

const HEADER_LABEL_CLASS = "text-xs leading-none font-bold";

export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" | undefined }): ReactNode {
  if (!active) return <ArrowUpDown className="size-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

export function TradeTable({
  trades,
  columns,
  t,
  locale,
  compact,
  selectable,
  dateInline,
  stickyHeader,
  selectionResetKey,
  onSelectionChange,
  sort,
  onSortChange,
}: {
  trades: MockTrade[];
  columns: ColumnKey[];
  t: TradeCenterText;
  locale: Locale;
  compact?: boolean;
  selectable?: boolean;
  dateInline?: boolean;
  stickyHeader?: boolean;
  selectionResetKey?: string | number;
  onSelectionChange?: (rowIds: string[]) => void;
  sort?: { key: ColumnKey; dir: "asc" | "desc" } | null;
  onSortChange?: (sort: { key: ColumnKey; dir: "asc" | "desc" }) => void;
}) {
  const displayCurrency = useDisplayCurrency();
  const [sortState, setSortState] = useState<{ key: ColumnKey; dir: "asc" | "desc" } | null>(null);
  const effectiveSort = sort ?? sortState;
  const rows = useMemo(() => {
    if (sort) return trades;
    if (!sortState) return trades;
    const factor = sortState.dir === "asc" ? 1 : -1;
    return [...trades].sort((a, b) => compareTrade(a, b, sortState.key) * factor);
  }, [trades, sort, sortState]);

  const toggleSort = useCallback(
    (key: ColumnKey) => {
      if (!SORTABLE_COLUMNS.includes(key)) return;
      if (onSortChange) {
        const next =
          !effectiveSort || effectiveSort.key !== key
            ? { key, dir: "desc" as const }
            : { key, dir: effectiveSort.dir === "desc" ? ("asc" as const) : ("desc" as const) };
        onSortChange(next);
        return;
      }
      setSortState((prev) => {
        if (!prev || prev.key !== key) return { key, dir: "desc" };
        return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      });
    },
    [effectiveSort, onSortChange],
  );

  const tableColumns = useMemo<DataTableColumn<MockTrade>[]>(() => {
    const result: DataTableColumn<MockTrade>[] = [];
    if (selectable) {
      result.push({
        id: "select",
        size: 44,
        header: ({ table }) => (
          <Checkbox
            aria-label={t.selectAllRows}
            checked={
              table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false
            }
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(!!checked)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t.selectRow}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-10" },
      });
    }
    for (const key of columns) {
      const sortable = SORTABLE_COLUMNS.includes(key);
      const active = effectiveSort?.key === key;
      result.push({
        id: key,
        size: columnWidth(key, Boolean(dateInline)),
        header: () =>
          sortable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toggleSort(key)}
              className={`h-auto px-0 ${HEADER_LABEL_CLASS}`}
            >
              {columnLabel(key, t)}
              <span
                className={`transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover/head:opacity-100"}`}
              >
                <SortIcon active={active} dir={effectiveSort?.dir} />
              </span>
            </Button>
          ) : (
            <span className={HEADER_LABEL_CLASS}>{columnLabel(key, t)}</span>
          ),
        cell: ({ row }) => tradeCell(row.original, key, t, locale, displayCurrency, Boolean(dateInline)),
        meta: {
          className: `group/head whitespace-nowrap ${alignClass(COLUMN_META[key].align)}`,
        },
      });
    }
    return result;
  }, [columns, dateInline, displayCurrency, effectiveSort, locale, selectable, t, toggleSort]);

  const scrollable = compact === true || stickyHeader === true;
  const rootClassName = stickyHeader
    ? "h-full max-h-full rounded-none border-0"
    : compact
      ? "max-h-[400px] rounded-none border-0"
      : "rounded-none border-0";
  const containerClassName = stickyHeader
    ? "h-full max-h-full overflow-y-auto overscroll-y-auto [scrollbar-gutter:stable]"
    : compact
      ? "max-h-[400px] overflow-y-auto overscroll-y-auto [scrollbar-gutter:stable]"
      : undefined;

  return (
    <DataTable
      columns={tableColumns}
      data={rows}
      getRowId={(trade) => trade.id}
      enableRowSelection={selectable}
      selectionResetKey={selectionResetKey}
      onSelectionChange={onSelectionChange}
      className={rootClassName}
      tableClassName="w-full table-fixed"
      containerClassName={containerClassName}
      headerClassName={scrollable ? "[&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-10 [&>tr>th]:bg-muted" : undefined}
      rowClassName="transition-colors hover:bg-muted/25"
      cellClassName={compact ? "whitespace-nowrap py-2" : "whitespace-nowrap"}
    />
  );
}

export function columnLabel(key: ColumnKey, t: TradeCenterText): string {
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

export function tradeCell(
  trade: MockTrade,
  key: ColumnKey,
  t: TradeCenterText,
  locale: Locale,
  currency: string,
  dateInline = false,
): ReactNode {
  const amountCurrency = trade.currency ?? currency;
  switch (key) {
    case "date":
      return <span className="text-muted-foreground">{formatShortDay(shanghaiDayKey(trade.closeTime), locale)}</span>;
    case "closeTime":
      return <span>{dateInline ? formatDateTime(trade.closeTime, locale) : formatClock(trade.closeTime, locale)}</span>;
    case "openTime":
      return <span>{dateInline ? formatDateTime(trade.openTime, locale) : formatClock(trade.openTime, locale)}</span>;
    case "side":
      return <TradeSideBadge side={trade.side} buyLabel={t.sideBuy} sellLabel={t.sideSell} />;
    case "symbol":
      return <SymbolBadge value={trade.symbol} />;
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
          {formatMoney(trade.netPnl, locale, amountCurrency)}
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
      return (
        <span className={`tabular-nums ${toneClass(trade.swap)}`}>
          {formatMoney(trade.swap, locale, amountCurrency)}
        </span>
      );
    case "commission":
      return (
        <span className={`tabular-nums ${toneClass(trade.commission)}`}>
          {formatMoney(trade.commission, locale, amountCurrency)}
        </span>
      );
    case "duration":
      return <span className="text-muted-foreground">{formatDuration(trade.durationSec, t)}</span>;
    case "account":
      return (
        <span className="block w-full truncate text-muted-foreground" title={trade.accountName}>
          {trade.accountName}
        </span>
      );
    case "strategy":
      return (
        <span className="block w-full truncate text-muted-foreground" title={trade.strategy ?? t.strategyNone}>
          {trade.strategy ?? t.strategyNone}
        </span>
      );
    default:
      return null;
  }
}
