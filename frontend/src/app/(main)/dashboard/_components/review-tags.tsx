"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Page, type ReviewTag } from "@/lib/tradesync/api";

export function ReviewTags({ accountId = "", revision = 0, selected = [], disabled = false, onSelect }: {
  accountId?: string; revision?: number; selected?: string[]; disabled?: boolean; onSelect: (tag: string) => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<Page<ReviewTag> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      api.reviewTags(page, query, accountId).then((result) => { if (active) setData(result); })
        .catch((e: Error) => { if (active) setError(e.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accountId, page, query, revision, retry]);
  return <div className="flex flex-col gap-3">
    <FieldGroup><Field><FieldLabel htmlFor={inputId}>查找已有标签</FieldLabel>
      <Input id={inputId} maxLength={40} placeholder="输入标签名称，点击标签使用" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
    </Field></FieldGroup>
    <p className="text-muted-foreground text-xs">数字为{accountId ? "当前账户" : "全部账户"}使用该标签的已保存复盘数，包含草稿和待恢复资料。</p>
    {loading ? <Skeleton className="h-9 w-full" /> : error ? <div role="alert" className="flex flex-col gap-2"><p className="text-destructive text-sm">标签加载失败：{error}</p><Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>重试加载标签</Button></div> : data && <>
      <div className="flex flex-wrap gap-2">{data.items.map((tag) => <Button key={tag.name} type="button" size="sm" variant="outline" disabled={disabled || selected.includes(tag.name)} onClick={() => onSelect(tag.name)} className="h-auto max-w-full whitespace-normal break-all">
        {tag.name} · {tag.review_count}{selected.includes(tag.name) ? " · 已选" : ""}
      </Button>)}</div>
      {!data.items.length && <p className="text-muted-foreground text-sm">{query ? "没有匹配的标签。" : "暂无已保存标签，可在交易复盘中填写并保存。"}</p>}
      {data.total > data.page_size && <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>上一组标签</Button>
        <span className="text-muted-foreground text-xs">{page} / {Math.ceil(data.total / data.page_size)} · {data.total} 个标签</span>
        <Button type="button" size="sm" variant="ghost" disabled={page * data.page_size >= data.total} onClick={() => setPage(page + 1)}>下一组标签</Button>
      </div>}
    </>}
  </div>;
}
