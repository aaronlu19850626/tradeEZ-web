"use client";

import { Plus } from "lucide-react";

import { SyncEmptyState } from "@/components/shared/sync-empty-state";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

export function EmptyState({ t, onAdd }: { t: AccountCenterText; onAdd: () => void }) {
  return (
    <SyncEmptyState
      title={t.emptyTitle}
      description={t.emptyBody}
      actionLabel={t.addAccountEmpty}
      onAction={onAdd}
      actionIcon={<Plus className="size-4" />}
      embedded
    />
  );
}
