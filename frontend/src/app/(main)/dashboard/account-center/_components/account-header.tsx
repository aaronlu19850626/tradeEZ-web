"use client";

import { HelpCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

export function AccountHeader({
  t,
  loading,
  accountCount,
  onHelp,
  onAdd,
}: {
  t: AccountCenterText;
  loading: boolean;
  accountCount: number;
  onHelp: () => void;
  onAdd: () => void;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onHelp}>
          <HelpCircle className="size-4" />
          {t.helpEa}
        </Button>
        <Button disabled={loading || accountCount >= 10} onClick={onAdd}>
          <Plus className="size-4" />
          {accountCount >= 10 ? t.accountLimitReached : t.addAccount}
        </Button>
      </div>
    </header>
  );
}
