"use client";

import { cn } from "cn";
import { Check } from "lucide-react";

import { PlatformIcon } from "@/components/domain/platform-icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
        {TRADING_PLATFORMS.map((platform) => {
          const active = platform.value === selected.value;
          return (
            <Button
              key={platform.value}
              type="button"
              variant={active ? "primary-soft" : "outline"}
              aria-pressed={active}
              onClick={() => onChange(platform.value)}
              className={cn(
                "relative h-11 justify-start gap-1.5 px-2 py-0",
                active && "font-semibold ring-1 ring-primary/25",
              )}
            >
              <PlatformIcon platform={platform.value} className="size-6 shrink-0" />
              <span className="min-w-0 truncate text-xs">{platform.label}</span>
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
