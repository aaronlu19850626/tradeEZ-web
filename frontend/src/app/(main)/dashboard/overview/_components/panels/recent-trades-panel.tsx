"use client";

import { useCallback, useMemo } from "react";

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import { SymbolBadge } from "@/components/shared/symbol-badge";
import { TradeSideBadge } from "@/components/shared/trade-side-badge";
import type { Locale } from "@/lib/i18n";
import type { DashboardText } from "@/lib/tradesync/dashboard-i18n";

import { money, tone } from "../../_lib/overview-data";

export interface RecentTradeRow {
  id: string;
  closeTime: number;
  symbol: string;
  side: "buy" | "sell";
  netPnl: number;
}

export function RecentTrades({ t, trades, locale }: { t: DashboardText; trades: RecentTradeRow[]; locale: Locale }) {
  const currency = useDisplayCurrency();
  const dateTime = useCallback(
    (epoch: number) =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(epoch * 1000)),
    [locale],
  );

  const columns: DataTableColumn<RecentTradeRow>[] = useMemo(
    () => [
      {
        id: "closeTime",
        size: 150,
        header: t.colCloseTime,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
            {dateTime(row.original.closeTime)}
          </span>
        ),
      },
      {
        id: "symbol",
        size: 88,
        header: () => <span className="block text-center">{t.colSymbol}</span>,
        cell: ({ row }) => (
          <div className="text-center">
            <SymbolBadge value={row.original.symbol} />
          </div>
        ),
      },
      {
        id: "side",
        size: 88,
        header: () => <span className="block text-center">{t.colSide}</span>,
        cell: ({ row }) => (
          <div className="text-center">
            <TradeSideBadge side={row.original.side} buyLabel={t.sideBuy} sellLabel={t.sideSell} />
          </div>
        ),
      },
      {
        id: "netPnl",
        size: 108,
        header: () => <span className="block text-right">{t.colNet}</span>,
        cell: ({ row }) => (
          <span className={`block text-right font-semibold tabular-nums ${tone(row.original.netPnl)}`}>
            {money(row.original.netPnl, locale, currency)}
          </span>
        ),
      },
    ],
    [currency, dateTime, locale, t.colCloseTime, t.colNet, t.colSide, t.colSymbol, t.sideBuy, t.sideSell],
  );

  return (
    <DataTable
      columns={columns}
      data={trades}
      getRowId={(trade) => trade.id}
      emptyMessage={t.na}
      className="h-full max-h-full"
      containerClassName="h-full overflow-y-auto overscroll-y-auto [scrollbar-gutter:stable]"
    />
  );
}
