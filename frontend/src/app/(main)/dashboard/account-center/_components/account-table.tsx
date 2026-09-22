"use client";

import type { ReactNode } from "react";

import { Star, StarOff } from "lucide-react";

import type { DataTableColumn } from "@/components/data-table/data-table";
import { PlatformIcon } from "@/components/domain/platform-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format-numbers";
import type { AccountCenterItem } from "@/lib/tradesync/account-center";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

import { formatMoney, formatUpdatedAt } from "../_lib/account-center-model";
import { AccountActionsMenu } from "./account-actions-menu";

function InlineAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="secondary" disabled={disabled} onClick={onClick} className="gap-1">
      {icon}
      {label}
    </Button>
  );
}

export function accountTableColumns({
  t,
  locale,
  onRename,
  onToggle,
  onReport,
  onKey,
  onImport,
  onRotate,
  onReset,
  onDelete,
}: {
  t: AccountCenterText;
  locale: string;
  onRename: (account: AccountCenterItem) => void;
  onToggle: (account: AccountCenterItem) => void;
  onReport: (account: AccountCenterItem) => void;
  onKey: (account: AccountCenterItem) => void;
  onImport: (account: AccountCenterItem) => void;
  onRotate: (account: AccountCenterItem) => void;
  onReset: (account: AccountCenterItem) => void;
  onDelete: (account: AccountCenterItem) => void;
}): DataTableColumn<AccountCenterItem>[] {
  return [
    {
      id: "name",
      size: 240,
      header: t.tableName,
      meta: { className: "pl-5" },
      cell: ({ row }) => {
        const account = row.original;
        return (
          <>
            <div className="flex items-center gap-2">
              <Button variant="link" className="h-auto p-0 font-semibold" onClick={() => onRename(account)}>
                {account.name ?? t.unnamed}
              </Button>
              {account.is_statistics && (
                <Badge variant="primary-soft" className="text-xs">
                  {t.statisticsAccount}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-semibold tracking-wide text-foreground/80">{t.syncStart}</span>
              <span className="ml-1">{account.sync_start_date ?? t.syncStartAll}</span>
            </p>
          </>
        );
      },
    },
    {
      id: "account",
      size: 220,
      header: t.tableMt5,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex w-9 shrink-0 flex-col items-center gap-0.5">
            <span className="flex size-9 items-center justify-center rounded-lg border bg-card shadow-sm">
              <PlatformIcon platform={row.original.platform} className="size-5" />
            </span>
            <Badge
              variant="outline"
              title={row.original.market_profile === "cn" ? t.marketCn : t.marketFx}
              className={`h-3.5 w-9 bg-transparent px-0 text-[8px] leading-none ${
                row.original.market_profile === "cn"
                  ? "border-destructive/35 text-destructive"
                  : "border-success/35 text-success"
              }`}
            >
              {row.original.market_profile === "cn" ? t.marketCn : t.marketFx}
            </Badge>
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.broker_server ?? "N/A"}</div>
            <div className="mt-1 w-fit rounded-md bg-muted px-2 py-1 font-mono text-sm font-medium">
              {String(row.original.mt5_login)}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "balance",
      size: 180,
      header: t.tableBalanceEquity,
      cell: ({ row }) => (
        <>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(row.original.balance, row.original.currency, locale)}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.equity} {formatMoney(row.original.equity, row.original.currency, locale)}
          </p>
        </>
      ),
    },
    {
      id: "updated",
      size: 160,
      header: t.tableUpdated,
      cell: ({ row }) => {
        const updated = formatUpdatedAt(row.original.last_updated_at, locale);
        return updated ? (
          <div className="inline-flex flex-col rounded-md bg-muted/60 px-2 py-1 font-mono text-sm leading-tight">
            <span>{updated.date}</span>
            <span className="mt-1 text-xs text-muted-foreground">{updated.time}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{t.noSnapshot}</span>
        );
      },
    },
    {
      id: "eaStatus",
      size: 150,
      header: t.tableSyncStatus,
      cell: ({ row }) =>
        row.original.ea_status === "online" ? (
          <Badge variant="success-soft" className="gap-2">
            <span className="size-1.5 rounded-full bg-success ring-2 ring-success/15" />
            {t.syncConnected}
          </Badge>
        ) : (
          <Badge variant="danger-soft" className="gap-2">
            <span className="size-1.5 rounded-full bg-danger ring-2 ring-danger/15" />
            {t.syncPending}
          </Badge>
        ),
    },
    {
      id: "tradeCount",
      size: 140,
      header: t.tableTrades,
      cell: ({ row }) => (
        <>
          <span className="text-lg font-semibold text-foreground">{formatCount(row.original.trade_count, locale)}</span>
          <span className="ml-1 text-sm text-muted-foreground">{t.tradesUnit}</span>
        </>
      ),
    },
    {
      id: "actions",
      size: 260,
      header: t.tableActions,
      meta: { className: "pr-5 text-right" },
      cell: ({ row }) => {
        const account = row.original;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <InlineAction
              label={account.is_statistics ? t.actionToggleOff : t.actionToggleOn}
              icon={account.is_statistics ? <StarOff /> : <Star />}
              onClick={() => onToggle(account)}
            />
            <AccountActionsMenu
              account={account}
              t={t}
              onReport={onReport}
              onKey={onKey}
              onImport={onImport}
              onRotate={onRotate}
              onReset={onReset}
              onDelete={onDelete}
            />
          </div>
        );
      },
    },
  ];
}
