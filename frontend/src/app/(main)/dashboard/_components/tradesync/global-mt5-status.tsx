"use client";

import { useEffect, useState } from "react";

import { cn } from "cn";
import { Radio } from "lucide-react";

import { useLocale } from "@/lib/i18n";
import { shellText } from "@/lib/shell-i18n";
import { type AccountCenterItem, accountCenterApi } from "@/lib/tradesync/account-center";
import { getToken } from "@/lib/tradesync/api";

export function GlobalMt5Status() {
  const locale = useLocale();
  const t = shellText[locale];
  const [accounts, setAccounts] = useState<AccountCenterItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    let active = true;
    let retryTimer: number | undefined;
    let sequence = 0;

    const load = (retry = false) => {
      const request = ++sequence;
      if (retryTimer) window.clearTimeout(retryTimer);
      accountCenterApi
        .list()
        .then((data) => {
          if (!active || request !== sequence) return;
          setAccounts(data);
          setLoaded(true);
          setFailed(false);
        })
        .catch(() => {
          if (!active || request !== sequence) return;
          if (retry) {
            setLoaded(true);
            setFailed(true);
          } else {
            retryTimer = window.setTimeout(() => load(true), 1200);
          }
        });
    };

    load();
    const refresh = () => load();
    window.addEventListener("tradesync-accounts-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("tradesync-accounts-changed", refresh);
      window.removeEventListener("focus", refresh);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, []);

  const online = accounts.filter((account) => account.ea_status === "online").length;
  const connected = online > 0;

  return (
    <div className="hidden h-9 min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-muted-foreground md:flex">
      <Radio className="size-3.5" />
      {failed ? (
        <span>{t.mt5StatusFailed}</span>
      ) : !loaded ? (
        <span>{t.mt5StatusLoading}</span>
      ) : (
        <>
          <span>
            {t.mt5Accounts}
            <span className="ml-1.5 text-base font-semibold tabular-nums text-sidebar-foreground">
              {accounts.length}
            </span>
          </span>
          <span className="text-border">|</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                connected
                  ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.14)]"
                  : "bg-rose-400 shadow-[0_0_0_3px_rgba(244,63,94,0.12)]",
              )}
            />
            {t.mt5EaOnline}
            <span className="text-base font-semibold tabular-nums text-sidebar-foreground">{online}</span>
          </span>
        </>
      )}
    </div>
  );
}
