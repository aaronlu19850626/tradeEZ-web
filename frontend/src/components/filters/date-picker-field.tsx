"use client";

import { useId, useState } from "react";

import { cn } from "cn";
import { CalendarDays } from "lucide-react";
import { enUS, zhCN } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocale } from "@/lib/i18n";

function parseDayValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDayValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DatePickerField({
  label,
  value,
  onChange,
  required,
  placeholder,
  clearLabel,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder: string;
  clearLabel: string;
  hint?: string;
}) {
  const locale = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = parseDayValue(value);
  const displayValue = selected
    ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(selected)
    : "";

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size="form"
            aria-label={label}
            className="w-full justify-start font-normal"
          >
            <span className={cn("truncate", !displayValue && "text-muted-foreground")}>
              {displayValue || placeholder}
            </span>
            <CalendarDays className="ml-auto size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            autoFocus
            locale={locale === "zh-CN" ? zhCN : enUS}
            onSelect={(date) => {
              onChange(date ? toDayValue(date) : "");
              setOpen(false);
            }}
          />
          <div className="border-t p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!selected}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {clearLabel}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
