"use client";

import type { RefObject } from "react";

import { RefreshCw } from "lucide-react";

import {
  AccountScopeMenu,
  RangeControl,
  type ResultFilter,
  type SideFilter,
  TradeFiltersMenu,
} from "@/components/filters/trade-filter-controls";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardText } from "@/lib/tradesync/dashboard-i18n";
import type { MarketProfile, TradeAccount, TradeSymbolOption } from "@/lib/tradesync/trade-center";

function formatLastUpdated(epoch: number | null, locale: string, fallback: string): string {
  if (epoch === null) return fallback;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(epoch * 1000));
}

export function OverviewToolbar({
  t,
  locale,
  toolbarRef,
  toolbarStuck,
  busy,
  fetching,
  lastUpdatedAt,
  onRefresh,
  side,
  result,
  currency,
  currencies,
  allowCurrencyAll,
  marketProfile,
  marketProfiles,
  allowMarketAll,
  symbolsSelected,
  symbolOptions,
  accounts,
  accountIds,
  dateRange,
  latestDay,
  earliestDay,
  onSide,
  onResult,
  onCurrency,
  onMarketProfile,
  onSymbolsChange,
  onRange,
  onAccountsChange,
}: {
  t: DashboardText;
  locale: string;
  toolbarRef: RefObject<HTMLDivElement | null>;
  toolbarStuck: boolean;
  busy: boolean;
  fetching: boolean;
  lastUpdatedAt: number | null;
  onRefresh: () => void;
  side: SideFilter;
  result: ResultFilter;
  currency: string;
  currencies: string[];
  allowCurrencyAll: boolean;
  marketProfile: MarketProfile;
  marketProfiles: MarketProfile[];
  allowMarketAll: boolean;
  symbolsSelected: string[];
  symbolOptions: TradeSymbolOption[];
  accounts: TradeAccount[];
  accountIds: string[];
  dateRange: { from: string; to: string };
  latestDay: string;
  earliestDay: string;
  onSide: (side: SideFilter) => void;
  onResult: (result: ResultFilter) => void;
  onCurrency: (currency: string) => void;
  onMarketProfile: (marketProfile: MarketProfile) => void;
  onSymbolsChange: (symbols: string[]) => void;
  onRange: (from: string, to: string) => void;
  onAccountsChange: (accountIds: string[]) => void;
}) {
  return (
    <div
      ref={toolbarRef}
      data-stuck={toolbarStuck}
      className={`sticky top-[73px] z-30 -mx-4 bg-background px-4 md:-mx-10 md:px-10 ${
        toolbarStuck ? "-mb-5 border-b border-foreground/35 pb-5" : ""
      }`}
    >
      <div
        aria-busy={busy}
        inert={busy ? true : undefined}
        className={busy ? "pointer-events-none opacity-70 transition-opacity" : "transition-opacity"}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 xl:flex-nowrap">
          <div className="flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground">
            <span>{t.lastTradeUpdate}:</span>
            <span className="font-medium text-foreground">
              {formatLastUpdated(lastUpdatedAt, locale, t.notAvailable)}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.refreshData}
                  disabled={fetching}
                  onClick={onRefresh}
                >
                  <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t.refreshData}</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
            <TradeFiltersMenu
              side={side}
              result={result}
              currency={currency}
              currencies={currencies}
              allowCurrencyAll={allowCurrencyAll}
              marketProfile={marketProfile}
              marketProfiles={marketProfiles}
              allowMarketAll={allowMarketAll}
              symbolsSelected={symbolsSelected}
              symbolOptions={symbolOptions}
              onSide={onSide}
              onResult={onResult}
              onCurrency={onCurrency}
              onMarketProfile={onMarketProfile}
              onSymbolsChange={onSymbolsChange}
            />
            <RangeControl range={dateRange} onRange={onRange} latestDay={latestDay} earliestDay={earliestDay} />
            <AccountScopeMenu accounts={accounts} selectedIds={accountIds} onApply={onAccountsChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
