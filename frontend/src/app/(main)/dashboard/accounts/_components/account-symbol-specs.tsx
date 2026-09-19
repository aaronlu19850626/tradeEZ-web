"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatDateTime, type SymbolSpec } from "@/lib/tradesync/api";

const PAGE_SIZE = 20;

function numberText(value: number): string {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 10 });
}

export function AccountSymbolSpecs({ accountId }: { accountId: number }) {
  const [items, setItems] = useState<SymbolSpec[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(keyword.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keyword, accountId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.accountSymbols(accountId, { q: query || undefined, page, page_size: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err: Error) => {
        if (active) setError(err.message || "品种规格加载失败");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId, page, query]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">EA 已上报品种规格</CardTitle>
        <CardDescription>共 {total} 个品种；成交解析使用这些合约规格，页面仅做只读核对。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input aria-label="搜索品种" placeholder="搜索品种代码，如 XAUUSD" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">EA 尚未上报匹配品种。首次完整同步后通常会写入当次成交涉及的品种规格。</p>
        ) : (
          <>
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>品种</TableHead>
                    <TableHead>精度</TableHead>
                    <TableHead>Point</TableHead>
                    <TableHead>Tick Size</TableHead>
                    <TableHead>Tick Value</TableHead>
                    <TableHead>合约规模</TableHead>
                    <TableHead>计价币种</TableHead>
                    <TableHead>更新时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.symbol}>
                      <TableCell className="font-mono text-xs">{item.symbol}</TableCell>
                      <TableCell>{item.digits}</TableCell>
                      <TableCell>{numberText(item.point)}</TableCell>
                      <TableCell>{numberText(item.tick_size)}</TableCell>
                      <TableCell>{numberText(item.tick_value)}</TableCell>
                      <TableCell>{numberText(item.contract_size)}</TableCell>
                      <TableCell>{item.currency_profit ?? item.currency_base ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDateTime(item.updated_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>第 {page} / {pageCount} 页</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
