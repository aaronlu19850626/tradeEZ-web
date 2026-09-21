"use client";

import { useCallback, useMemo } from "react";

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { SymbolBadge } from "@/components/shared/symbol-badge";
import type { Locale } from "@/lib/i18n";
import type { DashboardText } from "@/lib/tradesync/dashboard-i18n";
import type { MockTrade } from "@/lib/tradesync/trades-mock";

import { money, tone } from "../../_lib/overview-data";

export function RecentTrades({ t, trades, locale }: { t: DashboardText; trades: MockTrade[]; locale: Locale }) {
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

  const columns: DataTableColumn<MockTrade>[] = useMemo(
    () => [
      {
        id: "closeTime",
        header: t.colCloseTime,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
            {dateTime(row.original.closeTime)}
          </span>
        ),
      },
      {
        id: "symbol",
        header: () => <span className="block text-center">{t.colSymbol}</span>,
        cell: ({ row }) => (
          <div className="text-center">
            <SymbolBadge value={row.original.symbol} />
          </div>
        ),
      },
      {
        id: "netPnl",
        header: () => <span className="block text-right">{t.colNet}</span>,
        cell: ({ row }) => (
          <span className={`block text-right font-semibold tabular-nums ${tone(row.original.netPnl)}`}>
            {money(row.original.netPnl, locale)}
          </span>
        ),
      },
    ],
    [dateTime, locale, t.colCloseTime, t.colNet, t.colSymbol],
  );

  return (
    <DataTable
      columns={columns}
      data={trades}
      getRowId={(trade) => trade.id}
      emptyMessage={t.na}
      className="h-full max-h-full"
      containerClassName="h-full overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
    />
  );
}
