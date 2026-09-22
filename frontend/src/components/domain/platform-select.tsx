"use client";

import { cn } from "cn";
import { Check } from "lucide-react";

import { PlatformIcon } from "@/components/domain/platform-icon";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { findPlatform, TRADING_PLATFORMS } from "@/lib/tradesync/platforms";

export function PlatformSelect({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const selected = findPlatform(value);

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
        className="grid grid-cols-2 gap-1 sm:grid-cols-5"
      >
        {TRADING_PLATFORMS.map((platform) => {
          const active = platform.value === selected.value;
          return (
            <Label
              key={platform.value}
              htmlFor={`account-platform-${platform.value}`}
              className={cn(
                "relative flex h-11 cursor-pointer items-center justify-start gap-1.5 rounded-lg border bg-background px-2 py-0 transition-colors focus-within:ring-3 focus-within:ring-ring/50",
                active ? "border-primary/35 bg-primary-soft font-semibold" : "hover:bg-muted",
              )}
            >
              <RadioGroupItem id={`account-platform-${platform.value}`} value={platform.value} className="sr-only" />
              <PlatformIcon platform={platform.value} className="size-6 shrink-0" />
              <span className="min-w-0 truncate text-xs">{platform.label}</span>
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
