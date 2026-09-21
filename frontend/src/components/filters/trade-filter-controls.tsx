"use client";

import { type ReactNode, useEffect, useState } from "react";

import { CalendarDays, Check, ChevronDown, Plus, X } from "lucide-react";
import { enUS, zhCN } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Locale, useLocale } from "@/lib/i18n";
import { tradeFilterText } from "@/lib/tradesync/trade-filter-i18n";
import { addDays, dayKeyToEpoch, shanghaiWeekStart } from "@/lib/tradesync/trades-mock";

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

function FilterGroupLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuLabel className="px-2 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </DropdownMenuLabel>
  );
}

function SingleOption({ value, label, mono }: { value: string; label: string; mono?: boolean }) {
  return (
    <Label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
      <RadioGroupItem value={value} />
      <span className={`truncate ${mono ? "font-mono" : ""}`}>{label}</span>
    </Label>
  );
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
  const [open, setOpen] = useState(false);
  const [draftSide, setDraftSide] = useState<SideFilter>(side);
  const [draftResult, setDraftResult] = useState<ResultFilter>(result);
  const [draftCurrency, setDraftCurrency] = useState(currency);
  const [draftSymbols, setDraftSymbols] = useState<string[]>(symbolsSelected);

  useEffect(() => {
    if (!open) return;
    setDraftSide(side);
    setDraftResult(result);
    setDraftCurrency(currency);
    setDraftSymbols(symbolsSelected);
  }, [open, side, result, currency, symbolsSelected]);

  const filtersActive = side !== "all" || result !== "all" || currency !== "all" || symbolsSelected.length > 0;
  const selectedLabels = [
    side !== "all" ? (side === "buy" ? t.sideBuy : t.sideSell) : "",
    result !== "all" ? (result === "win" ? t.resultWin : t.resultLoss) : "",
    currency !== "all" ? currency : "",
    ...symbolsSelected,
  ].filter(Boolean);
  const applyClear = () => {
    onSide("all");
    onResult("all");
    onCurrency("all");
    onSymbolsChange([]);
    setOpen(false);
  };
  const applyDraft = () => {
    onSide(draftSide);
    onResult(draftResult);
    onCurrency(draftCurrency);
    onSymbolsChange(draftSymbols);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <InputGroup className="h-8 max-w-64">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-full min-w-0 flex-1 justify-start rounded-none border-0 px-2.5 font-normal shadow-none hover:bg-transparent aria-expanded:bg-transparent"
          >
            <span className="truncate">
              {selectedLabels.length > 0 ? `${t.filters} · ${selectedLabels.join(" · ")}` : t.filters}
            </span>
          </Button>
        </DropdownMenuTrigger>
        {filtersActive && (
          <InputGroupButton
            variant="ghost"
            size="icon-xs"
            className="mx-1 shrink-0 text-muted-foreground"
            aria-label={t.filterClear}
            onClick={applyClear}
          >
            <X className="size-3.5" />
          </InputGroupButton>
        )}
        <InputGroupAddon align="inline-end" className="pl-0 pr-1">
          <InputGroupButton
            variant="ghost"
            size="icon-xs"
            aria-label={t.filters}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64 rounded-lg p-1">
        <FilterGroupLabel>{t.filterDirection}</FilterGroupLabel>
        <RadioGroup value={draftSide} onValueChange={(value) => setDraftSide(value as SideFilter)} className="gap-0">
          <SingleOption value="all" label={t.filterAll} />
          <SingleOption value="buy" label={t.sideBuy} />
          <SingleOption value="sell" label={t.sideSell} />
        </RadioGroup>
        <DropdownMenuSeparator className="my-1" />
        <FilterGroupLabel>{t.filterResult}</FilterGroupLabel>
        <RadioGroup
          value={draftResult}
          onValueChange={(value) => setDraftResult(value as ResultFilter)}
          className="gap-0"
        >
          <SingleOption value="all" label={t.filterAll} />
          <SingleOption value="win" label={t.resultWin} />
          <SingleOption value="loss" label={t.resultLoss} />
        </RadioGroup>
        <DropdownMenuSeparator className="my-1" />
        <FilterGroupLabel>{t.filterCurrency}</FilterGroupLabel>
        <RadioGroup value={draftCurrency} onValueChange={setDraftCurrency} className="max-h-44 gap-0 overflow-y-auto">
          {allowCurrencyAll && <SingleOption value="all" label={t.filterAll} />}
          {currencies.map((name) => (
            <SingleOption key={name} value={name} label={name} />
          ))}
        </RadioGroup>
        <DropdownMenuSeparator className="my-1" />
        <FilterGroupLabel>{t.filterSymbol}</FilterGroupLabel>
        <div className="max-h-44 overflow-y-auto">
          <MultiOption label={t.filterAll} checked={draftSymbols.length === 0} onToggle={() => setDraftSymbols([])} />
          {symbolOptions.map((name) => (
            <MultiOption
              key={name}
              mono
              label={name}
              checked={draftSymbols.includes(name)}
              onToggle={() =>
                setDraftSymbols(
                  draftSymbols.includes(name) ? draftSymbols.filter((item) => item !== name) : [...draftSymbols, name],
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
          <Button variant="default" className="w-full" onClick={applyDraft}>
            {t.filterConfirm}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <Button variant="outline" className="gap-1.5 font-normal opacity-60" disabled>
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
        <Button variant="outline" className="gap-1.5 font-normal">
          <CalendarDays className="size-4 text-muted-foreground" />
          {formatRangeLabel(displayRange.from, displayRange.to, locale)}
          <ChevronDown className="size-3.5 text-muted-foreground" />
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
  const statisticsAccounts = accounts.filter((account) => account.isStatistics);
  const scoped = statisticsAccounts.length > 0 ? statisticsAccounts : accounts;

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
