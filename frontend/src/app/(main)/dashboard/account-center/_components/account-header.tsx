"use client";

import { Plus } from "lucide-react";

import { StickyPageHeader } from "@/app/(main)/dashboard/_components/sticky-page-header";
import { Button } from "@/components/ui/button";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

export function AccountHeader({
  t,
  loading,
  accountCount,
  onAdd,
}: {
  t: AccountCenterText;
  loading: boolean;
  accountCount: number;
  onAdd: () => void;
}) {
  return (
    <StickyPageHeader flush className="account-page-header">
      <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
      <div className="flex items-center gap-2">
        <Button disabled={loading || accountCount >= 10} onClick={onAdd}>
          <Plus className="size-4" />
          {accountCount >= 10 ? t.accountLimitReached : t.addAccount}
        </Button>
      </div>
    </StickyPageHeader>
  );
}
