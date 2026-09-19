"use client";

import { Globe } from "lucide-react";
import { useEffect, useState } from "react";

import { api, formatDateTime, type Account, getToken } from "@/lib/tradesync/api";

export function GlobalMt5Status() {
  const [accounts, setAccounts] = useState<Account[]>([]);
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
      api
        .accounts()
        .then((data) => {
          if (!active || request !== sequence) return;
          setAccounts(data);
          setLoaded(true);
          setFailed(false);
        })
        .catch(() => {
          if (!active || request !== sequence) return;
          if (retry) { setLoaded(true); setFailed(true); }
          else retryTimer = window.setTimeout(() => load(true), 1200);
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

  const activeAccounts = accounts.filter((account) => account.status === "active");
  const timezones = Array.from(
    new Set(activeAccounts.map((account) => account.server_timezone_name).filter(Boolean),
  )) as string[];
  const timezone = timezones.length === 1
    ? timezones[0]
    : timezones.length > 1
      ? `${timezones.length} 个服务器时区`
      : "未设置";
  const latestSeen = activeAccounts
    .map((account) => account.last_seen_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div
      className="hidden items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground md:flex"
      title={timezones.length > 1 ? timezones.join("、") : timezone}
    >
      <Globe className="size-3.5" />
      <span>MT5 时区：{timezone}</span>
      <span className="text-border">|</span>
      <span>{failed ? "状态读取失败，显示上次数据" : loaded ? `${activeAccounts.length}/${accounts.length} 启用` : "读取中"}</span>
      {latestSeen && <span className="hidden xl:inline">最近连接 {formatDateTime(latestSeen)}</span>}
    </div>
  );
}
