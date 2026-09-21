"use client";

import { KeyRound, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

export function EmptyState({ t, onAdd }: { t: AccountCenterText; onAdd: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <KeyRound className="size-6" />
      </div>
      <div>
        <h3 className="font-semibold">{t.emptyTitle}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t.emptyBody}</p>
      </div>
      <Button onClick={onAdd}>
        <Plus className="size-4" />
        {t.addAccountEmpty}
      </Button>
    </div>
  );
}
