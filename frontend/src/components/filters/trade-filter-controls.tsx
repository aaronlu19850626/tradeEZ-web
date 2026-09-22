"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { CalendarDays, Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { enUS, zhCN } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { tradeFilterText } from "@/lib/tradesync/trade-filter-i18n";
import { addDays, dayKeyToEpoch, shanghaiWeekStart } from "@/lib/tradesync/trades-mock";

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

function dayKeyToDate(dayKey: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateToDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
  symbolsSelected,
  symbolOptions,
  onSide,
  onResult,
  onCurrency,
  onSymbolsChange,
}: {
  side: SideFilter;
  result: ResultFilter;
  currency: string;
  currencies: string[];
  allowCurrencyAll?: boolean;
  symbolsSelected: string[];
  symbolOptions: string[];
  onSide: (side: SideFilter) => void;
  onResult: (result: ResultFilter) => void;
  onCurrency: (currency: string) => void;
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
        options: symbolOptions.map((name) => ({ value: name, label: name })),
      },
    ],
    [allowCurrencyAll, currencies, symbolOptions, t],
  );
  const value = useMemo<Record<string, string[]>>(
    () => ({
      side: side === "all" ? [] : [side],
      result: result === "all" ? [] : [result],
      currency: currency === "all" ? [] : [currency],
      symbol: symbolsSelected,
    }),
    [currency, result, side, symbolsSelected],
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
        onCurrency(next.currency?.[0] ?? "all");
        onSymbolsChange(next.symbol ?? []);
      }}
      clearLabel={t.filterClear}
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
  const [anchor, setAnchor] = useState<string | null>(null);

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
  const displayRange = range.from ? range : { from: earliestDay, to: latestDay };
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
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(displayRange);
          setAnchor(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 px-2.5 text-sm leading-none font-normal text-foreground"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="min-w-0 whitespace-nowrap">
            {formatRangeLabel(displayRange.from, displayRange.to, locale)}
          </span>
          {open ? <ChevronUp className="size-3.5 opacity-50" /> : <ChevronDown className="size-3.5 opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex">
          <div className="border-r p-3">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={{
                from: dayKeyToDate(draft.from || displayRange.from),
                to: draft.to ? dayKeyToDate(draft.to) : undefined,
              }}
              defaultMonth={dayKeyToDate(draft.to || displayRange.to)}
              locale={locale === "zh-CN" ? zhCN : enUS}
              onDayClick={(date) => {
                const dayKey = dateToDayKey(date);
                if (!anchor) {
                  setAnchor(dayKey);
                  setDraft({ from: dayKey, to: "" });
                  return;
                }
                const from = dayKey < anchor ? dayKey : anchor;
                const to = dayKey < anchor ? anchor : dayKey;
                setAnchor(null);
                setDraft({ from, to });
                onRange(from, to);
                setOpen(false);
              }}
            />
          </div>
          <div className="flex w-36 flex-col gap-0.5 p-3">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 justify-start px-2 text-xs font-normal"
                onClick={() => {
                  onRange(preset.range.from, preset.range.to);
                  setOpen(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
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
