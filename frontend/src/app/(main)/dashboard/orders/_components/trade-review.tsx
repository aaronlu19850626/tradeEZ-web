"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, type TradeReview } from "@/lib/tradesync/api";
import { ReviewTags } from "../../_components/review-tags";
import { ReviewAttachments } from "../../_components/review-attachments";
import { ReflectionFields } from "./reflection-fields";
import { ReviewHistory } from "./review-history";
import { RuleEvaluation } from "./rule-evaluation";
import { reflectionComplete } from "@/lib/tradesync/reflection";

export function TradeReviewEditor({ tradeId, onDirty, onSaved }: { tradeId: number; onDirty: (dirty: boolean) => void; onSaved?: () => void }) {
  const [data, setData] = useState<TradeReview | null>(null);
  const [tags, setTags] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [autoSaveBlocked, setAutoSaveBlocked] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "waiting" | "saving" | "saved" | "failed">("idle");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api.tradeReview(tradeId).then((result) => {
      if (active) { setData(result); setTags(result.tags.join(", ")); setDirty(false); setAutoSaveBlocked(false); setSaveState("idle"); }
    }).catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tradeId, revision]);
  useEffect(() => { onDirty(dirty || saving); }, [dirty, saving, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (!dirty || saving || loading || !data || autoSaveBlocked) return;
    const timer = window.setTimeout(() => { void save("draft", "auto"); }, 1500);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, loading, data, tags, autoSaveBlocked]);
  function markDirty() {
    setDirty(true); setError(""); setMessage(""); setAutoSaveBlocked(false); setSaveState("waiting");
  }
  async function save(status: TradeReview["status"], trigger: "auto" | "draft" | "submit") {
    if (!data || saving) return;
    const reject = (reason: string) => {
      setError(reason); setSaveState("failed");
      if (trigger === "auto") setAutoSaveBlocked(true);
    };
    if (status === "reviewed" && !reflectionComplete(data.reflection)) {
      reject("提交已复盘时请填写结论，并填写下次行动或选择无需新增行动"); return;
    }
    if (data.reflection.error_assessment === "identified" && !data.reflection.errors.length) {
      reject("请至少选择一项错误分类，或将错误自评改为尚未评估"); return;
    }
    const labels = Array.from(new Set(tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)));
    if (labels.length > 20 || labels.some((tag) => tag.length > 40)) { reject("最多 20 个标签，每个不超过 40 字。"); return; }
    setSaving(true); setError(""); setMessage(""); setSaveState("saving");
    try {
      const result = await api.saveTradeReview(tradeId, { revision: data.revision, source_hash: data.source_hash,
        status, notes: data.notes, tags: labels, reflection: data.reflection });
      setData({ ...data, review_id: result.review_id, revision: result.revision, status, tags: labels, source_changed: false });
      setDirty(false); setAutoSaveBlocked(false); setSaveState("saved");
      setMessage(trigger === "auto" ? "草稿已自动保存" : status === "reviewed" ? "已提交为已复盘" : "草稿已保存");
      onSaved?.();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，输入已保留"); setAutoSaveBlocked(true); setSaveState("failed"); }
    finally { setSaving(false); }
  }
  return <Card><CardHeader><CardTitle>交易复盘</CardTitle><CardDescription>记录判断、执行问题和改进；标签用逗号分隔。</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {loading && <Skeleton className="h-32 w-full" />}
      {!loading && data && <>
        {data.source_changed && <Alert><AlertTitle>成交数据有变化</AlertTitle><AlertDescription>原有复盘已保留。请对照成交重新核对；保存表示已核对当前数据。</AlertDescription></Alert>}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">当前状态</span><Badge variant={data.status === "reviewed" ? "default" : "secondary"}>{data.status === "reviewed" ? "已复盘" : "草稿"}</Badge></div>
          <p role="status" className="text-muted-foreground text-sm">{saveState === "waiting" ? "等待自动保存…" : saveState === "saving" ? "正在保存…" : saveState === "failed" ? "保存未完成，请按提示处理" : message || "修改后将自动保存为草稿"}</p>
        </div>
        <FieldGroup>
          <Field><FieldLabel htmlFor="review-tags">标签</FieldLabel><Input id="review-tags" disabled={saving} value={tags} placeholder="例如：追单，执行到位" onChange={(e) => { setTags(e.target.value); markDirty(); }} /></Field>
          <details><summary className="cursor-pointer text-sm">从已有标签中选择</summary><div className="pt-3"><ReviewTags revision={data.revision} disabled={saving} selected={tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)} onSelect={(tag) => {
            const current = Array.from(new Set(tags.split(/[,，]/).map((value) => value.trim()).filter(Boolean)));
            if (current.length >= 20) { setError("最多 20 个标签，请先移除一个标签。"); return; }
            if (!current.includes(tag)) { setTags([...current, tag].join(", ")); markDirty(); }
          }} /></div></details>
          <Field><FieldLabel htmlFor="review-notes">复盘笔记</FieldLabel><Textarea id="review-notes" disabled={saving} rows={7} maxLength={20000} value={data.notes}
            placeholder="入场理由、执行偏差、退出判断、下次改进…" onChange={(e) => { setData({ ...data, notes: e.target.value }); markDirty(); }} /></Field>
        </FieldGroup>
        <ReflectionFields value={data.reflection} disabled={saving} onChange={(reflection) => { setData({ ...data, reflection }); markDirty(); }} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={saving || (!dirty && !data.source_changed)} onClick={() => void save("draft", "draft")}>{saving ? "正在保存…" : saveState === "failed" ? "重试保存草稿" : "保存草稿"}</Button>
          <Button disabled={saving || (!dirty && !data.source_changed && data.status === "reviewed")} onClick={() => void save("reviewed", "submit")}>{saving ? "正在提交…" : "提交已复盘"}</Button>
        </div>
        <ReviewHistory tradeId={tradeId} revision={data.revision} />
        {data.review_id ? <RuleEvaluation reviewId={data.review_id} /> : <p className="text-muted-foreground text-sm">保存草稿后即可关联 Playbook 并评价执行规则。</p>}
        {data.review_id ? <ReviewAttachments key={data.review_id} reviewId={data.review_id} /> : <p className="text-muted-foreground text-sm">先保存一次复盘，即可上传截图。</p>}
      </>}
      {error && <Alert variant="destructive"><AlertTitle>复盘未完成</AlertTitle><AlertDescription>{error}。当前输入已保留。</AlertDescription></Alert>}
      <Button variant="outline" disabled={saving || loading} onClick={() => {
        if (!dirty || window.confirm("重新加载会丢弃尚未保存的文字，请先复制保留。确定重新加载吗？")) setRevision((v) => v + 1);
      }}>重新加载复盘</Button>
    </CardContent></Card>;
}
