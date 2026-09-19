"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Link2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  api,
  type Account,
  type WorkspaceSettings,
  formatDateTime,
  formatUnix,
  getToken,
} from "@/lib/tradesync/api";
import { DailyPlan } from "./daily-plan";
import { Intentions } from "./intentions";
import { DailyReviewCard } from "./daily-review";
import { SyncHealthAlerts } from "./sync-health-alerts";

export default function TodayPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const accountItems = await api.accounts();
      if (sequence !== loadSequence.current) return;
      setAccounts(accountItems);
      try { setWorkspace(await api.workspaceSettings()); }
      catch { setWorkspace({ display_timezone: "Asia/Shanghai", trading_day_start: "00:00", default_session: "全天", revision: 0, updated_at: null }); }
    } catch (err) {
      if (sequence === loadSequence.current) setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/auth/v2/login";
      return;
    }
    load();
  }, [load]);

  const activeAccounts = accounts.filter((account) => account.status === "active");
  const totalOrders = accounts.reduce((sum, account) => sum + account.synced_order_count, 0);
  const totalDeals = accounts.reduce((sum, account) => sum + account.deal_count, 0);
  const latestSync = accounts.map((account) => account.last_success_sync_at).filter(Boolean).sort().at(-1);
  const untrackedCases = accounts.reduce((sum, account) => sum + account.reconciliation_untracked_count, 0);
  const openCases = accounts.reduce((sum, account) => sum + account.reconciliation_open_count, 0);
  const investigatingCases = accounts.reduce((sum, account) => sum + account.reconciliation_investigating_count, 0);
  const resolvedCases = accounts.reduce((sum, account) => sum + account.reconciliation_resolved_count, 0);
  const pendingCases = untrackedCases + openCases + investigatingCases;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl tracking-tight">今日总览</h1>
          <p className="text-muted-foreground text-sm">优先查看同步状态和有效订单；账号绑定属于低频操作，已收纳到抽屉中。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setSyncRefreshKey((key) => key + 1); load(); }} disabled={loading}>
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          刷新
        </Button>
      </div>

      {error && (
        <Badge variant="destructive" className="justify-self-start px-3 py-1.5">
          {error}
        </Badge>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric title="已绑定账号" value={loading ? "—" : accounts.length} hint={`${activeAccounts.length} 个启用`} />
        <Metric title="同步有效订单" value={loading ? "—" : totalOrders} hint="按有效 position_id 去重" />
        <Metric title="原始成交记录" value={loading ? "—" : totalDeals} hint="EA 上传事实数，不等同订单数" />
        <Metric title="最近成功同步" value={latestSync ? formatDateTime(latestSync) : "暂无"} hint="服务端按 UTC 存储，本地展示" />
        <Metric title="异常待处理" value={loading ? "—" : pendingCases} hint={`未登记 ${untrackedCases} · 核对中 ${investigatingCases}`} />
      </div>

      <SyncHealthAlerts refreshKey={syncRefreshKey} />
      {!loading && pendingCases > 0 && <Card className="border-destructive/40">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>有 {pendingCases} 笔异常交易需要处理</CardTitle>
            <CardDescription>
              尚未登记 {untrackedCases} 笔，待处理 {openCases} 笔，核对中 {investigatingCases} 笔；另有 {resolvedCases} 笔已保留处理记录。
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/orders">查看异常订单<ArrowRight className="size-3.5" /></Link></Button>
        </CardHeader>
      </Card>}

      {!loading && <DailyPlan accounts={accounts} timezone={workspace?.display_timezone ?? "Asia/Shanghai"} />}
      {!loading && <Intentions accounts={accounts} timezone={workspace?.display_timezone ?? "Asia/Shanghai"} />}
      {!loading && <DailyReviewCard accounts={accounts} timezone={workspace?.display_timezone ?? "Asia/Shanghai"} />}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>账号连接状态</CardTitle>
            <CardDescription>这里用于确认 EA 是否连通、游标是否推进以及 MT5 时区是否已上报。</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/accounts">
              管理账号
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-3">
              {[1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted/60" />)}
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
              <Link2 className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">尚未绑定 MT5 账号</p>
                <p className="text-muted-foreground text-sm">绑定后把一次性 Key 写入 EA，即可开始同步。</p>
              </div>
              <Button asChild size="sm">
                <Link href="/dashboard/accounts">绑定 MT5 账号</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {accounts.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{account.label || account.mt5_login}</div>
                    <div className="text-muted-foreground text-xs">
                      {account.broker_server || "券商服务器待 EA 上报"} · MT5 时区 {account.server_timezone_name || "待上报"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>有效订单 {account.synced_order_count}</span>
                    <span className="text-muted-foreground">成交 {account.deal_count}</span>
                    <span className="text-muted-foreground">游标 {formatUnix(account.last_sync_time)}</span>
                    <Badge variant={account.status === "active" ? "default" : "secondary"}>
                      {account.status === "active" ? "启用" : "停用"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, hint }: { title: string; value: string | number; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="line-clamp-2 text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">{hint}</CardContent>
    </Card>
  );
}


