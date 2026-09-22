"use client";

import { cn } from "cn";
import { Check } from "lucide-react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
      <RadioGroup
        value={selected.value}
        onValueChange={onChange}
        required={required}
        disabled={disabled}
        className="grid grid-cols-3 gap-1 sm:grid-cols-6"
      >
        {TRADING_CURRENCIES.map((currency) => {
          const active = selected.value === currency.value;
          return (
            <Label
              key={currency.value}
              htmlFor={`account-currency-${currency.value}`}
              className={cn(
                "relative flex h-11 items-center justify-center gap-1 rounded-lg border bg-background px-1 transition-colors focus-within:ring-3 focus-within:ring-ring/50",
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                active ? "border-primary/35 bg-primary-soft font-semibold" : "hover:bg-muted",
              )}
            >
              <RadioGroupItem id={`account-currency-${currency.value}`} value={currency.value} className="sr-only" />
              <span className="text-xl leading-none">{currency.flag}</span>
              <span className="font-mono text-xs font-semibold">{currency.label}</span>
              {active && (
                <span className="absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </Label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
