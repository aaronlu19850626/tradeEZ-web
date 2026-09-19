"use client";

import { useEffect, useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, attachmentBlob, formatDateTime, type ReviewAttachment } from "@/lib/tradesync/api";

export function ReviewAttachments({ reviewId }: { reviewId: number }) {
  const inputId = useId();
  const [items, setItems] = useState<ReviewAttachment[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [revision, setRevision] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [imageError, setImageError] = useState("");
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    api.reviewAttachments(reviewId).then((result) => { if (active) setItems(result); })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reviewId, revision]);
  useEffect(() => {
    let active = true; let objectUrl = ""; setUrl(""); setImageError("");
    if (selected !== null) attachmentBlob(selected).then((blob) => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch((e: Error) => { if (active) setImageError(e.message); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected, revision]);
  async function upload() {
    if (!file || busy) return;
    if (file.size > 5 * 1024 * 1024) { setError("单张图片不能超过 5 MB。"); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.uploadAttachment(reviewId, file);
      setSelected(result.id); setFile(null); setInputKey((value) => value + 1); setRevision((value) => value + 1);
      setMessage("截图已保存；相同图片不会重复添加。");
    } catch (e) { setError(e instanceof Error ? e.message : "上传失败，请重试"); }
    finally { setBusy(false); }
  }
  async function remove(id: number) {
    if (busy || !window.confirm("确定永久删除这张复盘截图吗？笔记和交易数据保留。")) return;
    setBusy(true); setError(""); setMessage("");
    try { await api.deleteAttachment(id); if (selected === id) setSelected(null); setRevision((value) => value + 1); setMessage("截图已删除。"); }
    catch (e) { setError(e instanceof Error ? e.message : "删除失败"); }
    finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-3 rounded-lg border p-3">
    <h3 className="font-medium text-sm">复盘截图</h3>
    <p className="text-muted-foreground text-xs">支持静态 PNG、JPEG、WebP，单张 5 MB／1600 万像素以内；每份复盘最多 10 张，每账户 100 MB。上传和删除立即保存。重同步保留截图。</p>
    <FieldGroup><Field><FieldLabel htmlFor={inputId}>选择截图</FieldLabel><Input key={inputKey} id={inputId} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field></FieldGroup>
    <div className="flex gap-2"><Button type="button" disabled={!file || busy || loading} onClick={upload}>{busy ? "正在处理…" : "上传截图"}</Button><Button type="button" variant="outline" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>刷新附件</Button></div>
    {error && <Alert variant="destructive"><AlertTitle>附件操作未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {loading ? <p className="text-muted-foreground text-sm">正在读取附件…</p> : !error && !items.length ? <p className="text-muted-foreground text-sm">暂无截图。</p> : null}
    {!loading && items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
      <span className="text-xs">截图 #{item.id} · {item.width}×{item.height} · {Math.ceil(item.size / 1024)} KB · {formatDateTime(item.created_at)}</span>
      <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setSelected(item.id)}>查看截图 #{item.id}</Button><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => remove(item.id)}>删除截图 #{item.id}</Button></div>
    </div>)}
    {selected !== null && <div className="flex flex-col gap-2">
      {imageError ? <p role="alert" className="text-destructive text-sm">{imageError}</p> : url ? <><img src={url} alt={`复盘截图 ${selected}`} className="max-h-96 w-full object-contain" /><a href={url} download={`review-${selected}.png`} className="text-sm underline">下载截图 #{selected}</a></> : <p className="text-sm">正在读取截图…</p>}
      <Button type="button" variant="ghost" onClick={() => setSelected(null)}>收起截图</Button>
    </div>}
  </section>;
}
