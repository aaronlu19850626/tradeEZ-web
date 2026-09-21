"use client";

import { FileText, History, KeyRound, KeySquare, MoreVertical, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AccountCenterItem } from "@/lib/tradesync/account-center";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

export function AccountActionsMenu({
  account,
  t,
  onReport,
  onKey,
  onImport,
  onRotate,
  onReset,
  onDelete,
}: {
  account: AccountCenterItem;
  t: AccountCenterText;
  onReport: (account: AccountCenterItem) => void;
  onKey: (account: AccountCenterItem) => void;
  onImport: (account: AccountCenterItem) => void;
  onRotate: (account: AccountCenterItem) => void;
  onReset: (account: AccountCenterItem) => void;
  onDelete: (account: AccountCenterItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${account.name ?? t.unnamed} ${t.actionMore}`}>
          <MoreVertical className="size-4" strokeWidth={2.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => onReport(account)}>
          <FileText />
          {t.actionReport}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onKey(account)}>
          <KeyRound />
          {t.actionViewKey}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onImport(account)}>
          <Upload />
          {t.actionImport}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="warning" onSelect={() => onRotate(account)}>
          <KeySquare />
          {t.actionResetKey}
        </DropdownMenuItem>
        <DropdownMenuItem variant="warning" onSelect={() => onReset(account)}>
          <History />
          {t.actionResetTrades}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" variant="destructive" onSelect={() => onDelete(account)}>
          <Trash2 />
          {t.actionDelete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
