"use client";

import { ChevronLeft, ChevronRight, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/lib/tradesync/use-debounced-value";
import {
  api,
  type Account,
  type Page,
  type RawDeal,
  formatNumber,
  formatPrice,
  formatUnix,
  getToken,
} from "@/lib/tradesync/api";

const entryName = ["开仓", "平仓", "反手", "对向平仓"];

function dealTypeName(type: number) {
  if (type === 0) return "BUY";
  if (type === 1) return "SELL";
  return `TYPE ${type}`;
}

export default function RawDealsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [data, setData] = useState<Page<RawDeal> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticketInput, setTicketInput] = useState("");
  const [entry, setEntry] = useState("");
  const ticket = useDebouncedValue(ticketInput);
  const [pageNo, setPageNo] = useState(1);
  const [selected, setSelected] = useState<RawDeal | null>(null);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/auth/v2/login";
      return;
    }
    api.accounts()
      .then((items) => {
        setAccounts(items);
        setAccountId(items[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "账号加载失败"))
      .finally(() => setAccountsLoaded(true));
  }, []);

  useEffect(() => {
    if (accountId === null) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ account_id: String(accountId), page: String(pageNo), page_size: "50" });
    if (/^\d+$/.test(ticket.trim())) params.set("ticket", ticket.trim());
    if (entry) params.set("entry", entry);
    api.rawDeals(params)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "原始成交加载失败"))
      .finally(() => setLoading(false));
  }, [accountId, pageNo, ticket, entry]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? 50))),
    [data],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl tracking-tight">原始成交</h1>
        <p className="text-muted-foreground text-sm">EA 上传的事实记录只读；点击一行可查看全字段，后续人工修正会保留原值、原因和时间。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>查询</CardTitle>
          <CardDescription>共 {data?.total ?? 0} 条原始成交，同步有效订单请在“完整订单”页查看。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <NativeSelect className="w-full" value={accountId ?? ""} onChange={(event) => { setPageNo(1); setAccountId(Number(event.target.value)); }}>
            {accounts.length === 0 ? <NativeSelectOption value="">暂无账号</NativeSelectOption> : accounts.map((account) => (
              <NativeSelectOption key={account.id} value={account.id}>{account.label || account.mt5_login}</NativeSelectOption>
            ))}
          </NativeSelect>
          <Input placeholder="按成交号 ticket 查询" inputMode="numeric" value={ticketInput} onChange={(event) => { setPageNo(1); setTicketInput(event.target.value); }} />
          <NativeSelect className="w-full" value={entry} onChange={(event) => { setPageNo(1); setEntry(event.target.value); }}>
            <NativeSelectOption value="">全部成交类型</NativeSelectOption>
            <NativeSelectOption value="0">开仓</NativeSelectOption>
            <NativeSelectOption value="1">平仓</NativeSelectOption>
            <NativeSelectOption value="2">反手</NativeSelectOption>
            <NativeSelectOption value="3">系统</NativeSelectOption>
          </NativeSelect>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {error && <Badge variant="destructive" className="m-4 px-3 py-1.5">{error}</Badge>}
          <div className="overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead>成交号</TableHead>
                  <TableHead>持仓号</TableHead>
                  <TableHead>订单号</TableHead>
                  <TableHead>品种</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">价格</TableHead>
                  <TableHead className="text-right">止损</TableHead>
                  <TableHead className="text-right">止盈</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 8 }, (_, index) => (
                  <TableRow key={index}><TableCell colSpan={10}><div className="h-8 animate-pulse rounded bg-muted/60" /></TableCell></TableRow>
                ))}
                {!loading && (data?.items ?? []).map((deal) => (
                  <TableRow key={deal.id} className="cursor-pointer" onClick={() => setSelected(deal)}>
                    <TableCell className="font-mono">{deal.ticket}</TableCell>
                    <TableCell className="font-mono">{deal.position_id}</TableCell>
                    <TableCell className="font-mono">{deal.order_id}</TableCell>
                    <TableCell className="font-medium">{deal.symbol || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{entryName[deal.entry] ?? deal.entry}</Badge>
                      <span className="ml-2 text-muted-foreground text-xs">{dealTypeName(deal.type)}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(deal.volume, 2)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(deal.price)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(deal.sl_price)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(deal.tp_price)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatUnix(deal.deal_time)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!loading && (data?.items.length ?? 0) === 0 && (
            <Empty className="m-4 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Server /></EmptyMedia>
                <EmptyTitle>暂无原始成交</EmptyTitle>
                <EmptyDescription>{accountsLoaded && accounts.length === 0 ? "请先绑定 MT5 账号。" : "EA 上传后会在这里显示。"}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          <div className="flex items-center justify-end gap-2 p-4 text-sm">
            <Button size="sm" variant="outline" disabled={pageNo <= 1 || loading} onClick={() => setPageNo(pageNo - 1)}>
              <ChevronLeft className="size-4" />上一页
            </Button>
            <span className="text-muted-foreground">{pageNo}/{totalPages}</span>
            <Button size="sm" variant="outline" disabled={pageNo >= totalPages || loading} onClick={() => setPageNo(pageNo + 1)}>
              下一页<ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Drawer open={!!selected} onOpenChange={(open) => !open && setSelected(null)} direction="right">
        <DrawerContent className="rounded-none sm:max-w-2xl">
          <DrawerHeader>
            <DrawerTitle>原始成交详情</DrawerTitle>
            <DrawerDescription>只读事实数据，不在日志中保存价格、数量或盈亏。</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="px-4 pb-6">
            {selected && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="成交号 Ticket" value={String(selected.ticket)} mono />
                <Detail label="持仓号 Position" value={String(selected.position_id)} mono />
                <Detail label="订单号 Order" value={String(selected.order_id)} mono />
                <Detail label="账号" value={String(selected.account_login)} mono />
                <Detail label="品种" value={selected.symbol || "—"} />
                <Detail label="方向 / Entry" value={`${dealTypeName(selected.type)} / ${entryName[selected.entry] ?? selected.entry}`} />
                <Detail label="数量" value={formatNumber(selected.volume, 2)} />
                <Detail label="价格" value={formatPrice(selected.price)} />
                <Detail label="止损" value={formatPrice(selected.sl_price)} />
                <Detail label="止盈" value={formatPrice(selected.tp_price)} />
                <Detail label="盈亏" value={formatNumber(selected.profit, 2)} />
                <Detail label="库存费" value={formatNumber(selected.swap, 2)} />
                <Detail label="佣金" value={formatNumber(selected.commission, 2)} />
                <Detail label="Magic" value={String(selected.magic)} mono />
                <Detail label="开仓时间" value={formatUnix(selected.open_time)} />
                <Detail label="成交时间" value={formatUnix(selected.deal_time)} />
                <div className="sm:col-span-2">
                  <Detail label="Comment" value={selected.comment || "—"} />
                </div>
              </div>
            )}
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
