"use client";

import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RunBatches } from "./_components/run-batches";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  api,
  type Account,
  type ApiLog,
  type Page,
  type SyncRun,
  formatDateTime,
  formatUnix,
  getToken,
} from "@/lib/tradesync/api";

const runStatus: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  committed: { label: "已确认", variant: "default" },
  open: { label: "待确认", variant: "secondary" },
  expired: { label: "已过期", variant: "secondary" },
  failed: { label: "失败", variant: "destructive" },
};

export default function SyncLogsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | "">("");
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [runs, setRuns] = useState<Page<SyncRun> | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const error = [accountError, runError, logError].filter(Boolean).join("；");
  const [pageNo, setPageNo] = useState(1);
  const [selectedRun, setSelectedRun] = useState<SyncRun | null>(null);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/auth/v2/login";
      return;
    }
    let active = true;
    api.accounts().then((items) => {
      if (active) { setAccounts(items); setAccountError(null); }
    }).catch((err) => {
      if (active) setAccountError(err instanceof Error ? err.message : "账号加载失败");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    let active = true;
    const selectedAccount = accounts.find((account) => account.id === accountId);
    const params = new URLSearchParams({ page: String(pageNo), page_size: "30" });
    if (selectedAccount) params.set("account_id", String(selectedAccount.id));
    setLoadingRuns(true);
    setRunError(null);
    api.syncRuns(params)
      .then((result) => { if (active) setRuns(result); })
      .catch((err) => { if (active) setRunError(err instanceof Error ? err.message : "同步轮次加载失败"); })
      .finally(() => { if (active) setLoadingRuns(false); });
    return () => { active = false; };
  }, [accountId, pageNo, accounts]);

  useEffect(() => {
    if (!getToken()) return;
    let active = true;
    const selectedAccount = accounts.find((account) => account.id === accountId);
    const params = new URLSearchParams({ limit: "100" });
    if (selectedAccount) params.set("mt5_login", String(selectedAccount.mt5_login));
    setLoadingLogs(true);
    setLogError(null);
    api.logs(params)
      .then((result) => { if (active) setLogs(result); })
      .catch((err) => { if (active) setLogError(err instanceof Error ? err.message : "接口日志加载失败"); })
      .finally(() => { if (active) setLoadingLogs(false); });
    return () => { active = false; };
  }, [accountId, accounts]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((runs?.total ?? 0) / (runs?.page_size ?? 30))),
    [runs],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl tracking-tight">同步日志</h1>
          <p className="text-muted-foreground text-sm">只保存核心元数据、轮次、批次和数量，不保存订单价格、止损止盈或盈亏明细。</p>
        </div>
        <NativeSelect className="w-72" value={accountId} onChange={(event) => { setPageNo(1); setAccountId(event.target.value ? Number(event.target.value) : ""); }}>
          <NativeSelectOption value="">全部账号</NativeSelectOption>
          {accounts.map((account) => (
            <NativeSelectOption key={account.id} value={account.id}>{account.label || account.mt5_login}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {error && <Badge variant="destructive" className="px-3 py-1.5">{error}</Badge>}

      <Card>
        <CardHeader>
          <CardTitle>同步轮次</CardTitle>
          <CardDescription>游标只有在批次和数量确认后才会推进；点击一行查看握手详情。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>轮次</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>批次</TableHead>
                  <TableHead className="text-right">成交数</TableHead>
                  <TableHead className="text-right">新增/更新/重复</TableHead>
                  <TableHead>开始</TableHead>
                  <TableHead>确认</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRuns && Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={index}><TableCell colSpan={7}><div className="h-8 animate-pulse rounded bg-muted/60" /></TableCell></TableRow>
                ))}
                {!loadingRuns && (runs?.items ?? []).map((run) => {
                  const state = runStatus[run.status] ?? { label: run.status, variant: "secondary" as const };
                  return (
                    <TableRow key={run.id} className="cursor-pointer" onClick={() => setSelectedRun(run)}>
                      <TableCell className="font-mono">#{run.id}</TableCell>
                      <TableCell><Badge variant={state.variant}>{state.label}</Badge></TableCell>
                      <TableCell>{run.received_batch_count}/{run.expected_batch_count ?? "—"}</TableCell>
                      <TableCell className="text-right">{run.received_deal_count}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{run.inserted_count}/{run.updated_count}/{run.duplicated_count}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(run.started_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(run.committed_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!loadingRuns && (runs?.items.length ?? 0) === 0 && (
            <Empty className="mt-4 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ScrollText /></EmptyMedia>
                <EmptyTitle>暂无同步轮次</EmptyTitle>
                <EmptyDescription>EA 开始一次同步握手后，这里会显示批次确认结果。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={pageNo <= 1 || loadingRuns} onClick={() => setPageNo(pageNo - 1)}>
              <ChevronLeft className="size-4" />上一页
            </Button>
            <span className="text-muted-foreground">{pageNo}/{totalPages}</span>
            <Button size="sm" variant="outline" disabled={pageNo >= totalPages || loadingRuns} onClick={() => setPageNo(pageNo + 1)}>
              下一页<ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>接口日志</CardTitle>
          <CardDescription>日志可用于追踪请求结果和数量，但不会记录 Key、验证码、Token 或订单明细。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[1060px]">
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>接口</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead>轮次/批次</TableHead>
                  <TableHead className="text-right">新增/更新/重复</TableHead>
                  <TableHead className="text-right">耗时</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLogs && Array.from({ length: 8 }, (_, index) => (
                  <TableRow key={index}><TableCell colSpan={7}><div className="h-7 animate-pulse rounded bg-muted/60" /></TableCell></TableRow>
                ))}
                {!loadingLogs && logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(log.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{log.method} {log.path}</div>
                      {log.error_code && <div className="text-red-600 text-xs">{log.error_code}</div>}
                      {log.trace_id && <div className="text-muted-foreground text-[10px]">{log.trace_id}</div>}
                    </TableCell>
                    <TableCell><Badge variant={log.success ? "default" : "destructive"}>{log.status_code}</Badge></TableCell>
                    <TableCell className="text-right">{log.item_count ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{log.sync_run_id ? `#${log.sync_run_id}` : "—"}{log.batch_id ? ` / ${log.batch_id}` : ""}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {[log.inserted_count, log.updated_count, log.duplicated_count].every((value) => value === null || value === undefined)
                        ? "—"
                        : `${log.inserted_count ?? 0}/${log.updated_count ?? 0}/${log.duplicated_count ?? 0}`}
                    </TableCell>
                    <TableCell className="text-right">{log.duration_ms} ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!loadingLogs && logs.length === 0 && (
            <Empty className="mt-4 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ScrollText /></EmptyMedia>
                <EmptyTitle>暂无接口日志</EmptyTitle>
                <EmptyDescription>发生同步、心跳或网页操作后会在这里显示。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Drawer open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)} direction="right">
        <DrawerContent className="rounded-none sm:max-w-2xl">
          <DrawerHeader>
            <DrawerTitle>同步轮次 #{selectedRun?.id}</DrawerTitle>
            <DrawerDescription>用于确认本轮订单数据是否完整传输，以及游标是否允许推进。</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="min-h-0 flex-1 px-4 pb-6">
            {selectedRun && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="状态" value={runStatus[selectedRun.status]?.label ?? selectedRun.status} />
                <Detail label="协议版本" value={selectedRun.protocol_version} mono />
                <Detail label="EA 实例" value={selectedRun.instance_id || "旧 EA / 未上报"} mono />
                <Detail label="批次接收 / 预期" value={`${selectedRun.received_batch_count} / ${selectedRun.expected_batch_count ?? "—"}`} />
                <Detail label="成交接收 / 预期" value={`${selectedRun.received_deal_count} / ${selectedRun.expected_deal_count ?? "—"}`} />
                <Detail label="拒绝数量" value={String(selectedRun.rejected_count)} />
                <Detail label="新增 / 更新 / 重复" value={`${selectedRun.inserted_count} / ${selectedRun.updated_count} / ${selectedRun.duplicated_count}`} />
                <Detail label="起始游标" value={formatUnix(selectedRun.cursor_start)} />
                <Detail label="提交游标" value={formatUnix(selectedRun.cursor_end)} />
                <Detail label="开始时间" value={formatDateTime(selectedRun.started_at)} />
                <Detail label="确认时间" value={formatDateTime(selectedRun.committed_at)} />
                <Detail label="结束时间" value={formatDateTime(selectedRun.finished_at)} />
                <div className="sm:col-span-2">
                  <Detail label="校验值" value={selectedRun.checksum || "—"} mono />
                </div>
                {selectedRun.last_error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900 text-sm sm:col-span-2 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    {selectedRun.last_error}
                  </div>
                )}
              </div>
            )}
            {selectedRun && <RunBatches key={selectedRun.id} runId={selectedRun.id} onRunUpdated={setSelectedRun} />}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-1 break-all text-sm ${mono ? "font-mono" : "font-medium"}`}>{value}</p>
    </div>
  );
}
