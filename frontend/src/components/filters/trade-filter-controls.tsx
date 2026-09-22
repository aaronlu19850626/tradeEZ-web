"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";

import { CalendarDays, Check, ChevronDown, ChevronUp, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Locale, useLocale } from "@/lib/i18n";
import type { MarketProfile, TradeSymbolOption } from "@/lib/tradesync/trade-center";
import { tradeFilterText } from "@/lib/tradesync/trade-filter-i18n";
import { addDays, dayKeyToEpoch, shanghaiWeekStart } from "@/lib/tradesync/trades-mock";

import { DatePickerField } from "./date-picker-field";
import { type SelectConditionGroup, SelectMultiConditionControl, type SelectOption } from "./filter-select-controls";

export type SideFilter = "all" | "buy" | "sell";
export type ResultFilter = "all" | "win" | "loss";

export interface TradeAccountOption {
  id: string;
  name: string;
  isStatistics: boolean;
}

export function monthStart(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

export function monthEnd(dayKey: string): string {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function monthKeyShift(monthKey: string, delta: number): string {
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

export function formatMonthLabel(monthKey: string, locale: Locale): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", year: "numeric", month: "long" }).format(date);
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

function MultiOption({
  label,
  checked,
  onToggle,
  mono = false,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  mono?: boolean;
}) {
  return (
    <Label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className={`truncate ${mono ? "font-mono" : ""}`}>{label}</span>
    </Label>
  );
}

export function TradeFiltersMenu({
  side,
  result,
  currency,
  currencies,
  allowCurrencyAll = true,
  marketProfile = "fx",
  marketProfiles = ["fx"],
  allowMarketAll = true,
  symbolsSelected,
  symbolOptions = [],
  onSide,
  onResult,
  onCurrency,
  onMarketProfile,
  onSymbolsChange,
}: {
  side: SideFilter;
  result: ResultFilter;
  currency: string;
  currencies: string[];
  allowCurrencyAll?: boolean;
  marketProfile: MarketProfile;
  marketProfiles: MarketProfile[];
  allowMarketAll?: boolean;
  symbolsSelected: string[];
  symbolOptions: TradeSymbolOption[];
  onSide: (side: SideFilter) => void;
  onResult: (result: ResultFilter) => void;
  onCurrency: (currency: string) => void;
  onMarketProfile: (marketProfile: MarketProfile) => void;
  onSymbolsChange: (symbols: string[]) => void;
}) {
  const locale = useLocale();
  const t = tradeFilterText[locale];
  const groups = useMemo<SelectConditionGroup[]>(
    () => [
      {
        id: "side",
        label: t.filterDirection,
        mode: "single",
        options: [
          { value: "all", label: t.filterAll },
          { value: "buy", label: t.sideBuy },
          { value: "sell", label: t.sideSell },
        ],
      },
      {
        id: "result",
        label: t.filterResult,
        mode: "single",
        options: [
          { value: "all", label: t.filterAll },
          { value: "win", label: t.resultWin },
          { value: "loss", label: t.resultLoss },
        ],
      },
      {
        id: "market",
        label: t.filterMarket,
        mode: "single",
        options: [
          ...(allowMarketAll ? [{ value: "all", label: t.filterAll }] : []),
          ...marketProfiles.map((profile) => ({
            value: profile,
            label: profile === "cn" ? t.marketCn : t.marketFx,
          })),
        ],
      },
      {
        id: "currency",
        label: t.filterCurrency,
        mode: "single",
        options: [
          ...(allowCurrencyAll ? [{ value: "all", label: t.filterAll }] : []),
          ...currencies.map((name) => ({ value: name, label: name })),
        ],
      },
      {
        id: "symbol",
        label: t.filterSymbol,
        mode: "multiple",
        options: symbolOptions.map((item) => ({
          id: `symbol:${item.symbol}`,
          value: item.symbol,
          label: item.symbol,
          description: (
            <span className="flex flex-wrap items-center gap-y-1">
              {item.accounts?.map((account, index) => (
                <Fragment key={account.account_id}>
                  {index > 0 ? <span className="mx-1.5 h-3 w-px bg-border" /> : null}
                  <span className="max-w-32 truncate">{account.account_name}</span>
                </Fragment>
              ))}
            </span>
          ),
        })),
      },
    ],
    [allowCurrencyAll, allowMarketAll, currencies, marketProfiles, symbolOptions, t],
  );
  const value = useMemo<Record<string, string[]>>(
    () => ({
      side: side === "all" ? [] : [side],
      result: result === "all" ? [] : [result],
      currency: currency === "all" ? [] : [currency],
      market: [marketProfile],
      symbol: symbolsSelected,
    }),
    [currency, marketProfile, result, side, symbolsSelected],
  );

  return (
    <SelectMultiConditionControl
      value={value}
      groups={groups}
      title={t.filterTitle}
      noneLabel={t.filterNone}
      onChange={(next) => {
        onSide((next.side?.[0] ?? "all") as SideFilter);
        onResult((next.result?.[0] ?? "all") as ResultFilter);
        onCurrency(next.currency?.[0] ?? "USD");
        onMarketProfile((next.market?.[0] ?? "fx") as MarketProfile);
        onSymbolsChange(next.symbol ?? []);
      }}
      clearLabel={t.filterClear}
      closeLabel={t.filterCancel}
      confirmLabel={t.filterConfirm}
      align="end"
    />
  );
}

export function RangeControl({
  range,
  onRange,
  latestDay,
  earliestDay,
}: {
  range: { from: string; to: string };
  onRange: (from: string, to: string) => void;
  latestDay: string;
  earliestDay: string;
}) {
  const locale = useLocale();
  const t = tradeFilterText[locale];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: "", to: "" });

  if (!latestDay) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 px-2.5 text-sm leading-none font-normal opacity-60"
        disabled
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        {t.presetAll}
      </Button>
    );
  }

  const prevMonthDay = addDays(monthStart(latestDay), -1);
  const quickPresets: { label: string; range: { from: string; to: string } }[] = [
    { label: t.presetAllDates, range: { from: earliestDay, to: latestDay } },
    { label: t.presetToday, range: { from: latestDay, to: latestDay } },
    { label: t.presetThisWeek, range: { from: shanghaiWeekStart(dayKeyToEpoch(latestDay)), to: latestDay } },
    {
      label: t.presetLastWeek,
      range: {
        from: addDays(shanghaiWeekStart(dayKeyToEpoch(latestDay)), -7),
        to: addDays(shanghaiWeekStart(dayKeyToEpoch(latestDay)), -1),
      },
    },
    { label: t.presetLast30, range: { from: addDays(latestDay, -29), to: latestDay } },
    { label: t.presetYtd, range: { from: `${latestDay.slice(0, 4)}-01-01`, to: latestDay } },
  ];
  const recentMonths: { label: string; range: { from: string; to: string } }[] = Array.from(
    { length: 12 },
    (_, index) => {
      const key = monthKeyShift(latestDay.slice(0, 7), -index);
      return {
        label: formatMonthLabel(key, locale),
        range: { from: `${key}-01`, to: monthEnd(key) },
      };
    },
  );
  const recentQuarters: { label: string; range: { from: string; to: string } }[] = Array.from(
    { length: 6 },
    (_, index) => {
      const startMonth = monthKeyShift(
        `${latestDay.slice(0, 4)}-${String(Math.floor((Number(latestDay.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}`,
        -3 * index,
      );
      const quarterYear = Number(startMonth.slice(0, 4));
      const quarter = Math.floor((Number(startMonth.slice(5, 7)) - 1) / 3) + 1;
      return {
        label: `${quarterYear} Q${quarter}`,
        range: { from: `${startMonth}-01`, to: monthEnd(monthKeyShift(startMonth, 2)) },
      };
    },
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(range);
        }
        setOpen(next);
      }}
    >
      <div className="relative inline-flex items-center">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 gap-2 px-2.5 text-sm leading-none ${
              range.from ? "font-semibold text-foreground" : "font-semibold text-muted-foreground"
            }`}
          >
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="min-w-0 whitespace-nowrap">
              {range.from ? formatRangeLabel(range.from, range.to, locale) : t.dateRangeNone}
            </span>
            {range.from && (
              // biome-ignore lint/a11y: compact clear control inside the date trigger.
              <span
                className="flex size-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRange("", "");
                }}
              >
                <X className="size-3.5" />
              </span>
            )}
            {open ? <ChevronUp className="size-3.5 opacity-50" /> : <ChevronDown className="size-3.5 opacity-50" />}
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="end" className="w-[560px] max-w-[calc(100vw-2rem)] p-3">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DatePickerField
              label={t.filterStartDate}
              value={draft.from}
              placeholder={t.selectStartDate}
              clearLabel={t.filterClear}
              onChange={(nextFrom) => {
                const nextTo = nextFrom && draft.to && nextFrom > draft.to ? nextFrom : draft.to;
                setDraft({ from: nextFrom, to: nextTo });
              }}
            />
            <DatePickerField
              label={t.filterEndDate}
              value={draft.to}
              placeholder={t.selectEndDate}
              clearLabel={t.filterClear}
              onChange={(nextTo) => {
                const nextFrom = nextTo && draft.from && nextTo < draft.from ? nextTo : draft.from;
                setDraft({ from: nextFrom, to: nextTo });
              }}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{t.filterQuickRanges}</p>
              <div className="mt-2 flex flex-col gap-1">
                {quickPresets.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={draft.from === preset.range.from && draft.to === preset.range.to ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 justify-start px-2 text-sm font-normal"
                    onClick={() => setDraft(preset.range)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t.filterRecentQuarters}</p>
              <div className="mt-2 flex flex-col gap-1">
                {recentQuarters.map((quarter) => (
                  <Button
                    key={quarter.label}
                    type="button"
                    variant={draft.from === quarter.range.from && draft.to === quarter.range.to ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 justify-start px-2 text-sm font-normal"
                    onClick={() => setDraft(quarter.range)}
                  >
                    {quarter.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2">
              <p className="text-sm font-semibold text-foreground">{t.filterRecentMonths}</p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {[recentMonths.slice(0, 6), recentMonths.slice(6)].map((column, columnIndex) => (
                  <div key={columnIndex} className="flex flex-col gap-1">
                    {column.map((month) => (
                      <Button
                        key={month.label}
                        type="button"
                        variant={draft.from === month.range.from && draft.to === month.range.to ? "secondary" : "ghost"}
                        size="sm"
                        className="h-8 justify-start px-2 text-sm font-normal"
                        onClick={() => setDraft(month.range)}
                      >
                        {month.label}
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="-mx-3 flex justify-end gap-2 border-t px-3 pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setDraft(range);
                setOpen(false);
              }}
            >
              {t.filterCancel}
            </Button>
            <Button
              disabled={!draft.from || !draft.to}
              onClick={() => {
                onRange(draft.from, draft.to);
                setOpen(false);
              }}
            >
              {t.filterConfirm}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AccountScopeChips({
  accounts,
  selectedIds,
  onToggle,
  onSelectAll,
}: {
  accounts: TradeAccountOption[];
  selectedIds: string[];
  onToggle: (accountId: string) => void;
  onSelectAll: () => void;
}) {
  const locale = useLocale();
  const t = tradeFilterText[locale];
  const scoped = [...accounts].sort((left, right) => Number(right.isStatistics) - Number(left.isStatistics));

  return (
    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
      {scoped.map((account) => {
        const included = selectedIds.includes(account.id);
        return (
          <Tooltip key={account.id}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={included ? "primary-soft" : "outline"}
                aria-pressed={included}
                onClick={() => onToggle(account.id)}
                className={included ? "" : "border-dashed"}
              >
                {included ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                {account.name}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{included ? t.accountScopeExclude : t.accountScopeInclude}</TooltipContent>
          </Tooltip>
        );
      })}
      {selectedIds.length === 0 && (
        <Button type="button" variant="link" onClick={onSelectAll}>
          {t.accountScopeAll}
        </Button>
      )}
    </div>
  );
}

export function AccountScopeMenu({
  accounts,
  selectedIds,
  onApply,
}: {
  accounts: TradeAccountOption[];
  selectedIds: string[];
  onApply: (ids: string[]) => void;
}) {
  const locale = useLocale();
  const t = tradeFilterText[locale];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (!open) return;
    setDraft(selectedIds);
  }, [open, selectedIds]);

  const scoped = [...accounts].sort((left, right) => Number(right.isStatistics) - Number(left.isStatistics));
  const allSelected = draft.length === scoped.length;
  const selectedLabels = scoped.filter((account) => selectedIds.includes(account.id)).map((account) => account.name);
  const isDefaultScope = selectedIds.length === 0 || selectedIds.length === scoped.length;
  const accountLabel = isDefaultScope
    ? t.filterAll
    : selectedLabels.length <= 2
      ? selectedLabels.join("/")
      : `${selectedLabels[0]}/${selectedLabels[1]} 等${selectedLabels.length}项`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 w-auto gap-2 px-2.5 text-sm leading-none ${
            isDefaultScope ? "font-semibold text-muted-foreground" : "font-semibold text-foreground"
          }`}
        >
          <span className="min-w-0 whitespace-nowrap">
            {t.accountScopeTitle} · {accountLabel}
          </span>
          {open ? <ChevronUp className="size-3.5 opacity-50" /> : <ChevronDown className="size-3.5 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64 rounded-lg p-1">
        <MultiOption
          label={t.accountScopeAll}
          checked={allSelected}
          onToggle={() => setDraft(allSelected ? [] : scoped.map((account) => account.id))}
        />
        <DropdownMenuSeparator className="my-1" />
        <div className="max-h-52 overflow-y-auto">
          {scoped.map((account) => (
            <MultiOption
              key={account.id}
              label={account.name}
              checked={draft.includes(account.id)}
              onToggle={() =>
                setDraft((prev) =>
                  prev.includes(account.id) ? prev.filter((id) => id !== account.id) : [...prev, account.id],
                )
              }
            />
          ))}
        </div>
        <DropdownMenuSeparator className="my-1" />
        <div className="grid grid-cols-2 gap-1">
          <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
            {t.filterCancel}
          </Button>
          <Button
            variant="default"
            className="w-full"
            disabled={draft.length === 0}
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            {t.filterConfirm}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
