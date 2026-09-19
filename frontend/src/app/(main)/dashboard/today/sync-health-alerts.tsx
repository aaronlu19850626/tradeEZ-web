"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, KeyRound, Clock, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type SyncOverview, type SyncOverviewSignalAccount } from "@/lib/tradesync/api";
import { formatDateTime } from "@/lib/tradesync/api";

function AccountLabel({ item }: { item: SyncOverviewSignalAccount }) {
  return <span className="font-medium">{item.label ?? String(item.mt5_login)}</span>;
}

function formatStale(seconds: number | null): string {
  if (seconds === null) return "从未收到心跳";
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
  return `${Math.round(seconds / 3600)} 小时前`;
}

export function SyncHealthAlerts({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<SyncOverview | null>(null);

  useEffect(() => {
    let active = true;
    api.syncOverview()
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [refreshKey]);

  if (!data) return null;

  const authErrors = data.auth_errors ?? [];
  const uncommitted = data.cursor_uncommitted ?? [];
  const stale = data.heartbeat_stale ?? [];
  const resync = data.resync_pending_accounts ?? [];

  if (!authErrors.length && !uncommitted.length && !stale.length && !resync.length) {
    return (
      <Card className="border-emerald-500/40">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-emerald-700 dark:text-emerald-400">
          <Radio className="size-4" />
          同步正常：所有启用账号的密钥、游标与心跳均无异常信号。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {authErrors.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <KeyRound className="size-4" />
              {authErrors.length} 个账号存在密钥/签名失败
            </CardTitle>
            <CardDescription>
              最近一次同步请求被服务器拒绝。常见原因：重置密钥后 EA 未更新，或仍有另一个 EA 副本在用旧密钥。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {authErrors.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                <span><AccountLabel item={item} /> · {item.sync_auth_error_code === "SIGNATURE_MISMATCH" ? "签名不匹配" : item.sync_auth_error_code === "TIMESTAMP_EXPIRED" ? "请求时间戳过期" : "密钥无效"}</span>
                {item.sync_auth_error_at && <span className="text-muted-foreground text-xs">最近失败 {formatDateTime(item.sync_auth_error_at)}</span>}
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="mt-1 w-fit">
              <Link href="/dashboard/sync-logs">查看同步日志 <ArrowRight className="size-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {uncommitted.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-4" />
              {uncommitted.length} 个账号成交已到达但游标未确认
            </CardTitle>
            <CardDescription>两阶段同步的游标提交尚未完成，下一轮 EA 会安全重传，不会产生重复成交。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {uncommitted.map((item) => (
              <div key={item.id}><AccountLabel item={item} /></div>
            ))}
          </CardContent>
        </Card>
      )}

      {resync.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-800 dark:text-amber-300">{resync.length} 个账号等待重新同步</CardTitle>
            <CardDescription>已执行重同步，等待 EA 用新密钥从设定起点重新上传数据。</CardDescription>
          </CardHeader>
        </Card>
      )}

      {stale.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" />
              {stale.length} 个账号心跳陈旧
            </CardTitle>
            <CardDescription>
              EA 在持仓期间可能长时间不发心跳，因此这只是关注信号，不代表已离线。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
            {stale.map((item) => (
              <div key={item.id} className="flex justify-between gap-2">
                <AccountLabel item={item} />
                <span>{formatStale(item.seconds_since_heartbeat)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
