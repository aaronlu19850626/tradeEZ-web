"use client";

import { useEffect, useMemo, useState } from "react";

import { Check, ChevronLeft, ChevronRight, Download, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fill, type Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import type { MockTrade, TradeStats } from "@/lib/tradesync/trades-mock";

import { type ColumnKey, formatPercent, formatStatMoney, toneClass } from "../_lib/trade-center-model";
import { AvgWinLossBar, DayTrendChart, DonutStat, MetricCard, WinRateStats } from "./trade-metric-cards";
import { TradeTable } from "./trade-table";

export function AllView({
  t,
  locale,
  trades,
  stats,
  total,
  series,
  columns,
  page,
  onPage,
  sort,
  onSortChange,
  loading = false,
}: {
  t: TradeCenterText;
  locale: Locale;
  trades: MockTrade[];
  stats: TradeStats;
  total: number;
  series: { index: number; value: number }[];
  columns: ColumnKey[];
  page: number;
  onPage: (page: number) => void;
  sort: { key: ColumnKey; dir: "asc" | "desc" } | null;
  onSortChange: (sort: { key: ColumnKey; dir: "asc" | "desc" } | null) => void;
  loading?: boolean;
}) {
  const pageSize = 100;
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [pageInput, setPageInput] = useState(String(page));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  useEffect(() => setPageInput(String(current)), [current]);
  const start = (current - 1) * pageSize;
  const rows = trades;
  const ordered = useMemo(() => [...trades].sort((a, b) => a.closeTime - b.closeTime), [trades]);
  const grossTotal = stats.winSum + stats.lossSum;
  const winShare = grossTotal > 0 ? stats.winSum / grossTotal : 0.5;

  const jumpToPage = () => {
    const next = Math.min(totalPages, Math.max(1, Number.parseInt(pageInput, 10) || 1));
    setPageInput(String(next));
    onPage(next);
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          t={t}
          title={t.cumulativeNet}
          tip={t.tipCumulative}
          value={<span className={toneClass(stats.net)}>{formatStatMoney(stats.net, locale)}</span>}
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
                  <span className="text-profit">{formatStatMoney(stats.winSum, locale)}</span>
                  <span className="text-loss">{formatStatMoney(-stats.lossSum, locale)}</span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-0.5">
                <span>
                  {t.winTotal} {formatStatMoney(stats.winSum, locale)}
                </span>
                <span>
                  {t.lossTotal} {formatStatMoney(-stats.lossSum, locale)}
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
      <Card
        aria-busy={loading}
        className={`flex flex-1 flex-col gap-0 overflow-hidden pt-0 pb-0 ${
          loading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"
        }`}
      >
        <CardHeader className="flex h-16 flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-0 pb-0!">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-base font-bold">
              {fill(t.rowsRange, {
                from: total === 0 ? "0" : String(start + 1),
                to: String(Math.min(start + pageSize, total)),
                total: String(total),
              })}
            </CardTitle>
            <Badge variant="secondary" role="status" aria-live="polite" className="font-normal">
              {fill(t.rowsSelected, { selected: selectedRows.length, total: rows.length })}
            </Badge>
          </div>
          <div className="flex h-8 flex-wrap items-center justify-end gap-2">
            <Pagination className="mx-0 h-8 w-auto items-center justify-end">
              <PaginationContent className="h-8 items-center">
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t.prevPage}
                    disabled={current <= 1}
                    onClick={() => onPage(current - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Badge
                    aria-current="page"
                    variant="outline"
                    className="h-8 px-3 text-sm font-normal tabular-nums whitespace-nowrap"
                  >
                    {fill(t.pagination, { page: String(current), totalPages: String(totalPages) })}
                  </Badge>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t.nextPage}
                    disabled={current >= totalPages}
                    onClick={() => onPage(current + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageInput}
                    aria-label={t.goToPage}
                    className="w-14 px-1 py-0! text-center text-sm leading-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    style={{ height: "32px", minHeight: "32px" }}
                    onChange={(event) => setPageInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") jumpToPage();
                    }}
                    onBlur={jumpToPage}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-1.5 font-normal"
                  disabled={selectedRows.length === 0}
                  aria-label={`${t.bulkActions} (${selectedRows.length})`}
                >
                  <MoreHorizontal className="size-4" />
                  {t.bulkActions}
                  {selectedRows.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                      {selectedRows.length}
                    </span>
                  )}
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
        <div className="min-h-0 flex-1">
          <TradeTable
            trades={rows}
            columns={columns}
            t={t}
            locale={locale}
            selectable
            dateInline
            stickyHeader
            sort={sort}
            onSortChange={onSortChange}
            selectionResetKey={`${current}:${rows.map((trade) => trade.id).join(",")}`}
            onSelectionChange={setSelectedRows}
          />
        </div>
      </Card>
    </>
  );
}
