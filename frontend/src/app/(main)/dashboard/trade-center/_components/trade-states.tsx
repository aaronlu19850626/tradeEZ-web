"use client";

import type { ReactNode } from "react";

import { Plus, TrendingDown } from "lucide-react";

import { SyncEmptyState } from "@/components/shared/sync-empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";

export function NoAccountsPanel({ t }: { t: TradeCenterText }) {
  return (
    <SyncEmptyState
      title={t.noAccountsTitle}
      description={t.noAccountsDescription}
      actionLabel={t.goToAccounts}
      href="/dashboard/account-center"
      actionIcon={<Plus className="size-4" />}
    />
  );
}

export function ErrorPanel({ t, onRetry }: { t: TradeCenterText; onRetry: () => void }) {
  return (
    <Card className="items-center gap-3 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-loss/10 text-loss">
        <TrendingDown className="size-5" />
      </span>
      <CardTitle className="text-base">{t.errorTitle}</CardTitle>
      <p className="text-sm text-muted-foreground">{t.errorDescription}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t.errorRetry}
      </Button>
    </Card>
  );
}

/** Page / data loading state: an animated waveform plus a short message. */
export function LoadingWave({ t }: { t: TradeCenterText }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24">
      <div data-slot="loading-wave" className="flex h-16 items-center gap-2" aria-hidden>
        {bars.map((index) => (
          <span
            key={index}
            className="tradeez-loading-bar h-16 w-3 rounded-full bg-primary"
            style={{ animationDelay: `${(-index * 1.45) / bars.length}s` }}
          />
        ))}
      </div>
      <div className="text-center">
        <p className="text-xl font-semibold">{t.loadingTitle}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{t.loadingDescription}</p>
      </div>
    </div>
  );
}

export function MetaButton({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <Button type="button" variant="secondary" size="sm" className="gap-1.5">
      {icon}
      {label}
    </Button>
  );
}

export function LoadMore({ label, remaining, onClick }: { label: string; remaining: number; onClick: () => void }) {
  return (
    <Button variant="outline" className="w-full" onClick={onClick}>
      {label} ({remaining})
    </Button>
  );
}

export function EmptyPanel({ t }: { t: TradeCenterText }) {
  return (
    <SyncEmptyState
      title={t.emptyTitle}
      description={t.emptyDescription}
      actionLabel={t.goToAccounts}
      href="/dashboard/account-center"
      actionIcon={<Plus className="size-4" />}
    />
  );
}
