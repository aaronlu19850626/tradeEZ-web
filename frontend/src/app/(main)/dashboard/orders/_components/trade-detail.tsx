"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatNumber, formatUnix, type TradeDetail } from "@/lib/tradesync/api";
import { TradeReviewEditor } from "./trade-review";
import { TradeReconciliationEditor } from "./trade-reconciliation";

function amount(value: number) {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

export function TradeDetailDrawer({ tradeId, onClose, onReviewSaved }: { tradeId: number; onClose: () => void; onReviewSaved?: () => void }) {
  const [data, setData] = useState<TradeDetail | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.tradeDetail(tradeId, page)
      .then((result) => { if (active) setData(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "详情加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tradeId, page, revision]);

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? 30)));
  return (
    <Drawer open onOpenChange={(open) => { if (!open && (!reviewDirty || window.confirm("复盘尚未保存，确定关闭并丢弃修改吗？"))) onClose(); }} direction="right">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>交易 #{tradeId}</DrawerTitle>
          <DrawerDescription>查看该生命周期的成交来源和费用归属，原始成交保持不变。</DrawerDescription>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 pb-6">
          <div className="flex min-w-0 flex-col gap-4">
            <TradeReviewEditor tradeId={tradeId} onDirty={setReviewDirty} onSaved={onReviewSaved} />
            <Button variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}>刷新详情</Button>
            {loading && <Skeleton className="h-32 w-full" />}
            {error && <Alert variant="destructive"><AlertTitle>无法读取交易</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            {!loading && !error && data && <>
              <TradeReconciliationEditor
                tradeId={tradeId}
                needsReview={data.trade.reconciliation_status === "needs_review"}
                onSaved={onReviewSaved}
              />
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt>原始持仓号</dt><dd className="break-all">{data.trade.position_id}</dd>
                <dt>品种 / 方向</dt><dd>{data.trade.symbol} / {data.trade.direction.toUpperCase()}</dd>
                <dt>开仓</dt><dd>{formatUnix(data.trade.open_time)}</dd>
                <dt>平仓</dt><dd>{formatUnix(data.trade.close_time)}</dd>
                <dt>已记录净盈亏</dt><dd>{amount(data.trade.net_pnl)}</dd>
              </dl>
              <Alert>
                <AlertTitle>分摊口径</AlertTitle>
                <AlertDescription>
                  反转成交的利润和库存费归入平仓部分，佣金按开平手数比例分摊。金额单位为账户币种。
                  明细显示分摊值，不会覆盖 MT5 原始值。
                </AlertDescription>
              </Alert>
              <Table>
                <TableHeader><TableRow><TableHead>成交 / 用途</TableHead><TableHead>手数</TableHead><TableHead>金额明细</TableHead></TableRow></TableHeader>
                <TableBody>{data.allocations.map((item) => (
                  <TableRow key={`${item.deal_ticket}-${item.role}`}>
                    <TableCell>
                      <div>{item.deal_ticket}</div>
                      <div className="text-muted-foreground text-xs">{item.role === "open" ? "开仓" : item.role === "close" ? "平仓" : "待核对"}</div>
                      {item.method !== "reported" && <div className="text-muted-foreground text-xs">反转分摊</div>}
                    </TableCell>
                    <TableCell>{formatNumber(item.volume, 2)}</TableCell>
                    <TableCell>
                      <div>利润 {amount(item.profit)}</div>
                      <div>库存费 {amount(item.swap)}</div>
                      <div>佣金 {amount(item.commission)}</div>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button>
                <span>{page}/{pages}</span>
                <Button variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>下一页</Button>
              </div>
            </>}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
