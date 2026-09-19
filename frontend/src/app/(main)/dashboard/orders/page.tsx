"use client";

import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TradeDetailDrawer } from "./_components/trade-detail";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/lib/tradesync/use-debounced-value";
import {
  api,
  type Account,
  type OrderSummary,
  type Page,
  formatHold,
  formatNumber,
  formatPrice,
  formatUnix,
  getToken,
} from "@/lib/tradesync/api";

const reviewReasons: Record<string, string> = {
  missing_opening: "缺少开仓成交",
  volume_mismatch: "开平数量不一致",
  opening_direction_conflict: "开仓方向冲突",
  closing_direction_conflict: "平仓方向冲突",
  missing_reversal_opening: "缺少反转前持仓",
  reversal_requires_lifecycle_split: "包含反转，需按交易阶段核对",
  non_trade_deal: "包含非买卖成交类型",
};

export default function OrdersPage() {
  const [selectedTrade, setSelectedTrade] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [data, setData] = useState<Page<OrderSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [caseStatus, setCaseStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const [symbolInput, setSymbolInput] = useState("");
  const symbol = useDebouncedValue(symbolInput);
  const [pageNo, setPageNo] = useState(1);

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
      .finally(() => { setAccountsLoaded(true); setLoading(false); });
  }, []);

  useEffect(() => {
    if (accountId === null) return;
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ account_id: String(accountId), page: String(pageNo), page_size: "50" });
    if (status) params.set("status", status);
    if (reviewStatus) params.set("review_status", reviewStatus);
    if (caseStatus) params.set("reconciliation_case", caseStatus);
    if (symbol.trim()) params.set("symbol", symbol.trim());

    api.orders(params)
      .then((result) => { if (active) {
        const lastPage = Math.max(1, Math.ceil(result.total / result.page_size));
        if (pageNo > lastPage) { setPageNo(lastPage); return; }
        setData(result);
      } })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "订单加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId, pageNo, status, symbol, reviewStatus, caseStatus, revision]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? 50))),
    [data],
  );
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const timezone = data?.server_timezone_name || selectedAccount?.server_timezone_name || "未设置（当前 EA 不上报时区）";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl tracking-tight">完整订单</h1>
        <p className="text-muted-foreground text-sm">按交易生命周期展示；反转拆分为两笔，点击交易编号查看成交与费用归属。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>
            MT5 服务器时区：<span className="font-medium text-foreground">{timezone}</span>
            {data?.account_currency ? ` · 币种：${data.account_currency}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent><FieldGroup className="grid gap-3 md:grid-cols-5">
          <Field><FieldLabel htmlFor="orders-account">账户</FieldLabel><NativeSelect id="orders-account" className="w-full" value={accountId ?? ""} onChange={(event) => { setPageNo(1); setAccountId(Number(event.target.value)); }}>
            {accounts.length === 0 ? <NativeSelectOption value="">暂无账号</NativeSelectOption> : accounts.map((account) => (
              <NativeSelectOption key={account.id} value={account.id}>{account.label || account.mt5_login}</NativeSelectOption>
            ))}
          </NativeSelect></Field>
          <Field><FieldLabel htmlFor="orders-symbol">品种</FieldLabel><Input id="orders-symbol" placeholder="品种搜索，如 XAU" value={symbolInput} onChange={(event) => { setPageNo(1); setSymbolInput(event.target.value); }} /></Field>
          <Field><FieldLabel htmlFor="orders-status">交易状态</FieldLabel><NativeSelect id="orders-status" className="w-full" value={status} onChange={(event) => { setPageNo(1); setStatus(event.target.value); }}>
            <NativeSelectOption value="">全部状态</NativeSelectOption>
            <NativeSelectOption value="closed">已结束</NativeSelectOption>
            <NativeSelectOption value="open">历史记录有剩余数量</NativeSelectOption>
            <NativeSelectOption value="needs_review">待核对</NativeSelectOption>
          </NativeSelect></Field>
          <Field><FieldLabel htmlFor="orders-review">复盘状态</FieldLabel><NativeSelect id="orders-review" className="w-full" value={reviewStatus} onChange={(event) => { setPageNo(1); setReviewStatus(event.target.value); }}>
            <NativeSelectOption value="">全部复盘状态</NativeSelectOption><NativeSelectOption value="unwritten">未填写</NativeSelectOption><NativeSelectOption value="draft">草稿</NativeSelectOption><NativeSelectOption value="reviewed">已复盘</NativeSelectOption>
          </NativeSelect></Field>
          <Field><FieldLabel htmlFor="orders-case">异常处理</FieldLabel><NativeSelect id="orders-case" className="w-full" value={caseStatus} onChange={(event) => { setPageNo(1); setCaseStatus(event.target.value); }}>
            <NativeSelectOption value="">全部处理状态</NativeSelectOption>
            <NativeSelectOption value="untracked">尚未登记</NativeSelectOption>
            <NativeSelectOption value="open">待处理</NativeSelectOption>
            <NativeSelectOption value="investigating">核对中</NativeSelectOption>
            <NativeSelectOption value="resolved">已处理</NativeSelectOption>
          </NativeSelect></Field>
          </FieldGroup>
          <p className="mt-3 text-muted-foreground text-xs">未填写表示从未保存复盘；草稿包含已保存但未完成的复盘。“待核对”属于成交数据状态，与人工复盘状态独立。</p>
          <Button className="mt-3" variant="outline" disabled={loading || !accountId} onClick={() => setRevision((value) => value + 1)}>刷新订单与复盘状态</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>订单列表</CardTitle>
          <CardDescription>
            共 {data?.total ?? 0} 笔交易；缺失开仓、数量异常与无法核对的反转记录标记为待核对。
            历史剩余数量不代表实时持仓，金额以所选账户币种为准。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <Badge variant="destructive" className="mb-3 px-3 py-1.5">{error}</Badge>}
          <div className="overflow-x-auto">
            <Table className="min-w-[1360px]">
              <TableHeader>
                <TableRow>
                  <TableHead>交易 / 持仓号</TableHead>
                  <TableHead>品种</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead className="text-right">数量(入/出)</TableHead>
                  <TableHead className="text-right">止损</TableHead>
                  <TableHead className="text-right">止盈</TableHead>
                  <TableHead className="text-right">库存费</TableHead>
                  <TableHead className="text-right">佣金</TableHead>
                  <TableHead className="text-right">净盈亏</TableHead>
                  <TableHead>持仓时间</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>模型 / 执行</TableHead>
                  <TableHead>复盘</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 8 }, (_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={13}><div className="h-8 animate-pulse rounded bg-muted/60" /></TableCell>
                  </TableRow>
                ))}
                {!loading && (data?.items ?? []).map((order) => (
                  <TableRow key={order.trade_id}>
                    <TableCell>
                      <Button variant="link" onClick={() => setSelectedTrade(order.trade_id)}>#{order.trade_id}</Button>
                      <div className="text-muted-foreground text-xs">{order.position_id}</div>
                    </TableCell>
                    <TableCell className="font-medium">{order.symbol || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={order.direction === "buy" ? "default" : order.direction === "sell" ? "secondary" : "outline"}>
                        {order.direction.toUpperCase()}
                      </Badge>
                      {order.reconciliation_status === "needs_review" && (
                        <p className="text-muted-foreground text-xs">
                          {order.reconciliation_issues.map((issue) => reviewReasons[issue] ?? "成交记录需核对").join("；")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatNumber(order.volume_in, 2)} / {formatNumber(order.volume_out, 2)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(order.sl_price)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(order.tp_price)}</TableCell>
                    <TableCell className="text-right">{formatNumber(order.swap_total, 2)}</TableCell>
                    <TableCell className="text-right">{formatNumber(order.commission_total, 2)}</TableCell>
                    <TableCell className={`text-right font-medium ${order.net_pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatNumber(order.net_pnl, 2)}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono whitespace-nowrap">{formatHold(order.hold_seconds)}</div>
                      <div className="text-muted-foreground text-xs whitespace-nowrap">{formatUnix(order.open_time)} → {formatUnix(order.close_time)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.reconciliation_status === "needs_review" ? "destructive" : "secondary"}>
                        {order.reconciliation_status === "needs_review" ? "待核对" : order.is_closed ? "已结束" : "有剩余数量"}
                      </Badge>
                      {order.reconciliation_status === "needs_review" && <div className="mt-1">
                        <Badge variant="outline">
                          {order.reconciliation_case_state === "resolved" ? "人工已处理" : order.reconciliation_case_state === "investigating" ? "人工核对中" : order.reconciliation_case_state === "open" ? "人工待处理" : "尚未登记"}
                        </Badge>
                      </div>}
                    </TableCell>
                    <TableCell className="min-w-40">
                      {order.setup_name ? <><p className="font-medium">{order.setup_name} · v{order.playbook_version}</p><div className="flex flex-wrap gap-1">{order.execution_score !== null && <Badge variant="outline">执行分 {order.execution_score.toFixed(1)}</Badge>}<Badge variant={order.execution_compliance === "violations" ? "destructive" : "secondary"}>{order.evaluation_complete ? order.execution_compliance === "violations" ? "存在违规" : "评价完整" : "评价未完成"}</Badge></div>{order.critical_failures.length > 0 && <p className="text-destructive text-xs">关键违规 {order.critical_failures.length} 项</p>}</> : <span className="text-muted-foreground text-sm">未关联</span>}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelectedTrade(order.trade_id)}>{order.review_status === "reviewed" ? "已复盘" : order.review_status === "draft" ? "草稿" : "未填写"}</Button>
                      {order.review_source_changed && <p className="text-destructive text-xs">成交已变化，请复核笔记</p>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!loading && (data?.items.length ?? 0) === 0 && (
            <Empty className="mt-4 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ListOrdered /></EmptyMedia>
                <EmptyTitle>暂无订单</EmptyTitle>
                <EmptyDescription>{accountsLoaded && accounts.length === 0 ? "请先绑定 MT5 账号。" : "可调整品种或状态筛选，或等待 EA 完成同步。"}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
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
      {selectedTrade !== null && <TradeDetailDrawer key={selectedTrade} tradeId={selectedTrade} onReviewSaved={() => setRevision((value) => value + 1)} onClose={() => { setSelectedTrade(null); setRevision((value) => value + 1); }} />}
    </div>
  );
}
