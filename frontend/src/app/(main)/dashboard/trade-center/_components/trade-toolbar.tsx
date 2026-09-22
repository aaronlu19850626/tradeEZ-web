"use client";

import { useState } from "react";

import { ChevronsDown, ChevronsUp, Columns3 } from "lucide-react";

import {
  type SelectConditionGroup,
  SelectMultiConditionControl,
  type SelectOption,
  SelectSingleControl,
} from "@/components/filters";
import {
  AccountScopeMenu,
  RangeControl,
  type ResultFilter,
  type SideFilter,
  TradeFiltersMenu,
} from "@/components/filters/trade-filter-controls";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TradeAccount } from "@/lib/tradesync/trade-center";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";

import type { ViewMode } from "../_lib/trade-center-model";

export function Toolbar({
  t,
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
  currency,
  currencies,
  allowCurrencyAll,
  onCurrency,
  symbolsSelected,
  symbolOptions,
  onSymbolsChange,
  onOpenColumns,
  tablesExpanded,
  onToggleAllTables,
  accounts,
  selectedAccountIds,
  onAccountsChange,
}: {
  t: TradeCenterText;
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
  currency: string;
  currencies: string[];
  allowCurrencyAll: boolean;
  onCurrency: (currency: string) => void;
  symbolsSelected: string[];
  symbolOptions: string[];
  onSymbolsChange: (symbols: string[]) => void;
  onOpenColumns: () => void;
  tablesExpanded: boolean;
  onToggleAllTables: () => void;
  accounts: TradeAccount[];
  selectedAccountIds: string[];
  onAccountsChange: (accountIds: string[]) => void;
}) {
  const [product, setProduct] = useState("MT5");
  const [leftProduct, setLeftProduct] = useState<string | null>(null);
  const [multiValue, setMultiValue] = useState<Record<string, string[]>>({});
  const productOptions: SelectOption[] = [
    { value: "MT5", label: "MT5" },
    { value: "MT4", label: "MT4" },
    { value: "cTrader", label: "cTrader" },
    { value: "ATAS", label: "ATAS" },
    { value: "CTP", label: "CTP" },
  ];
  const conditionGroups: SelectConditionGroup[] = [
    { id: "platform", label: "平台", mode: "single", options: productOptions },
    {
      id: "status",
      label: "状态",
      mode: "multiple",
      options: [
        { value: "open", label: "未平仓" },
        { value: "closed", label: "已平仓" },
      ],
    },
  ];
  const views: { key: ViewMode; label: string }[] = [
    { key: "day", label: t.viewDay },
    { key: "week", label: t.viewWeek },
    { key: "all", label: t.viewAll },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 xl:flex-nowrap">
      <ToggleGroup
        type="single"
        value={view}
        onValueChange={(value) => value && onView(value as ViewMode)}
        variant="outline"
        size="sm"
        spacing={1}
        className="rounded-lg border-0 bg-primary-soft p-1"
      >
        {views.map((item) => (
          <ToggleGroupItem
            key={item.key}
            value={item.key}
            className="min-w-16 border-0 px-4 data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground"
          >
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
        <SelectSingleControl
          value={leftProduct}
          options={productOptions}
          placeholder="产品"
          onValueChange={setLeftProduct}
          align="start"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t.columns} onClick={onOpenColumns}>
              <Columns3 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t.columns}</TooltipContent>
        </Tooltip>

        {view !== "all" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={tablesExpanded ? t.collapseAllTables : t.expandAllTables}
                onClick={onToggleAllTables}
              >
                {tablesExpanded ? <ChevronsUp className="size-4" /> : <ChevronsDown className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tablesExpanded ? t.collapseAllTables : t.expandAllTables}</TooltipContent>
          </Tooltip>
        )}

        <TradeFiltersMenu
          side={side}
          result={result}
          currency={currency}
          currencies={currencies}
          allowCurrencyAll={allowCurrencyAll}
          symbolsSelected={symbolsSelected}
          symbolOptions={symbolOptions}
          onSide={onSide}
          onResult={onResult}
          onCurrency={onCurrency}
          onSymbolsChange={onSymbolsChange}
        />

        <RangeControl range={range} onRange={onRange} latestDay={latestDay} earliestDay={earliestDay} />

        <AccountScopeMenu accounts={accounts} selectedIds={selectedAccountIds} onApply={onAccountsChange} />
        <SelectSingleControl
          value={product}
          options={productOptions}
          placeholder="产品"
          onValueChange={setProduct}
          align="end"
        />
        <SelectMultiConditionControl value={multiValue} groups={conditionGroups} onChange={setMultiValue} align="end" />
      </div>
    </div>
  );
}
