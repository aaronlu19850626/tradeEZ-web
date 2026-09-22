"use client";

import type { ReactNode } from "react";

import { Loader2, Plus, TrendingDown } from "lucide-react";

import { LoadingWave } from "@/components/shared/loading-wave";
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

export { LoadingWave };

export function MetaButton({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <Button type="button" variant="secondary" size="sm" className="gap-1.5">
      {icon}
      {label}
    </Button>
  );
}

export function LoadMore({
  label,
  remaining,
  onClick,
  loading = false,
}: {
  label: string;
  remaining?: number;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <Button variant="outline" className="w-full" disabled={loading} onClick={onClick}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {remaining === undefined ? label : `${label} (${remaining})`}
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
