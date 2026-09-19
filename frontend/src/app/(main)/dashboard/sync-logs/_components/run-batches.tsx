"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatDateTime, type SyncRun, type SyncRunDetail } from "@/lib/tradesync/api";

export function RunBatches({ runId, onRunUpdated }: { runId: number; onRunUpdated: (run: SyncRun) => void }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<SyncRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    api.syncRunDetail(runId, page)
      .then((result) => {
        if (!active) return;
        setData(result);
        onRunUpdated(result.run);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "批次加载失败");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [runId, page, revision, onRunUpdated]);

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? 20)));
  return (
    <section aria-label="本轮接收批次" aria-busy={loading} className="mt-6 flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">本轮接收批次</h3>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
          刷新详情
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">批次已接收不代表游标已提交，请同时查看上方轮次状态。</p>
      {loading && <Skeleton className="h-24 w-full" />}
      {error && <Alert variant="destructive"><AlertTitle>无法读取批次</AlertTitle><AlertDescription>{error}，请点击刷新重试。</AlertDescription></Alert>}
      {!loading && data && data.total === 0 && (
        <Empty><EmptyHeader><EmptyTitle>暂无批次记录</EmptyTitle>
          <EmptyDescription>本轮可能尚未上传批次，或使用了不携带批次标识的旧版同步。</EmptyDescription>
        </EmptyHeader></Empty>
      )}
      {!loading && data && data.total > 0 && (
        <>
          <Table>
            <TableHeader><TableRow>
              <TableHead>批次</TableHead><TableHead>结果</TableHead>
              <TableHead className="text-right">数量</TableHead><TableHead className="text-right">重试</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <p className="max-w-48 break-all font-mono text-xs">{batch.batch_id}</p>
                    <p className="text-muted-foreground text-xs">第 {batch.batch_index + 1} / {batch.batch_count} 批</p>
                    <p className="text-muted-foreground text-xs">{formatDateTime(batch.received_at)}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={batch.status === "received" ? "secondary" : "destructive"}>
                      {batch.status === "received" ? "已接收" : batch.status === "failed" ? "失败" : batch.status}
                    </Badge>
                    <p className="mt-1 text-muted-foreground text-xs">
                      新增 {batch.inserted_count} · 更新 {batch.updated_count}<br />
                      重复 {batch.duplicated_count} · 拒绝 {batch.rejected_count}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">{batch.item_count}</TableCell>
                  <TableCell className="text-right">{batch.retries}</TableCell>
                </TableRow>
              ))}
              {data.batches.length === 0 && <TableRow><TableCell colSpan={4}>本页暂无批次，请返回上一页。</TableCell></TableRow>}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button>
            <span className="text-muted-foreground text-xs">共 {data.total} 批 · {page}/{pages} 页</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>下一页</Button>
          </div>
        </>
      )}
    </section>
  );
}
