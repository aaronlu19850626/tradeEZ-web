"use client";

import { cn } from "cn";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { findCurrency, TRADING_CURRENCIES } from "@/lib/tradesync/currencies";

export function CurrencySelect({
  label,
  value,
  onChange,
  required,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const selected = findCurrency(value);

  return (
    <div className="grid gap-2">
      <Label>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-6" aria-disabled={disabled}>
        {TRADING_CURRENCIES.map((currency) => {
          const active = selected.value === currency.value;
          return (
            <Button
              key={currency.value}
              type="button"
              variant={active ? "primary-soft" : "outline"}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(currency.value)}
              className={cn(
                "relative h-11 justify-center gap-1 px-1",
                active && "font-semibold ring-1 ring-primary/25",
              )}
            >
              <span className="text-xl leading-none">{currency.flag}</span>
              <span className="font-mono text-xs font-semibold">{currency.label}</span>
              {active && (
                <span className="absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
