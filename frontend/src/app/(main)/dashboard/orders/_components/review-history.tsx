"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { api, formatDateTime, type Page, type ReviewVersion } from "@/lib/tradesync/api";
import { EMOTIONS, REVIEW_ERRORS } from "@/lib/tradesync/reflection";

export function ReviewHistory({ tradeId, revision }: { tradeId: number; revision: number }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ReviewVersion> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextPage = 1) {
    setLoading(true); setError("");
    try { setData(await api.reviewVersions(tradeId, nextPage)); setPage(nextPage); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "历史版本读取失败"); }
    finally { setLoading(false); }
  }

  return <Collapsible open={open} onOpenChange={(value) => { setOpen(value); if (value && (!data || data.items[0]?.revision !== revision)) void load(1); }} className="group rounded-lg border">
    <CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between rounded-lg px-3">
      <span>历史版本{data ? `（${data.total}）` : ""}</span><ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
    </Button></CollapsibleTrigger>
    <CollapsibleContent className="border-t p-3">
      {loading && <p className="text-muted-foreground text-sm">正在读取历史版本…</p>}
      {error && <Alert variant="destructive"><AlertTitle>历史版本读取失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!loading && data?.items.length === 0 && <p className="text-muted-foreground text-sm">尚无已保存版本。</p>}
      {!loading && data && <div className="space-y-3">
        {data.items.map((item) => <details key={item.revision} className="rounded-md border p-3">
          <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="font-medium">版本 {item.revision}</span><Badge variant={item.status === "reviewed" ? "default" : "secondary"}>{item.status === "reviewed" ? "已复盘" : "草稿"}</Badge></div>
            <span className="text-muted-foreground text-xs">{formatDateTime(item.created_at)}</span>
          </div></summary>
          <div className="mt-3 space-y-2 border-t pt-3 text-sm">
            <HistoryRow label="标签" value={item.tags.join("、") || "无"} />
            <HistoryRow label="复盘笔记" value={item.notes || "未填写"} preserve />
            <HistoryRow label="入场前情绪" value={item.reflection.emotion_before ? EMOTIONS[item.reflection.emotion_before] : "未评估"} />
            <HistoryRow label="离场后情绪" value={item.reflection.emotion_after ? EMOTIONS[item.reflection.emotion_after] : "未评估"} />
            <HistoryRow label="错误分类" value={item.reflection.errors.map((code) => REVIEW_ERRORS[code]).join("、") || "未评估"} />
            <HistoryRow label="结论" value={item.reflection.conclusion || "未填写"} preserve />
            <HistoryRow label="下次行动" value={item.reflection.no_new_action ? "无需新增行动" : item.reflection.next_action || "未填写"} preserve />
          </div>
        </details>)}
        <div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>上一页</Button><span className="text-muted-foreground text-xs">第 {page} / {Math.max(1, Math.ceil(data.total / data.page_size))} 页</span><Button variant="outline" size="sm" disabled={page * data.page_size >= data.total || loading} onClick={() => void load(page + 1)}>下一页</Button></div>
      </div>}
    </CollapsibleContent>
  </Collapsible>;
}

function HistoryRow({ label, value, preserve = false }: { label: string; value: string; preserve?: boolean }) {
  return <div><span className="text-muted-foreground">{label}：</span><span className={preserve ? "whitespace-pre-wrap" : ""}>{value}</span></div>;
}
