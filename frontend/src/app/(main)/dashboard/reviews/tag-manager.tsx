"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type TagChangePreview } from "@/lib/tradesync/api";

export function TagManager({ accountId, accountName, initialTag, onClose, onChanged }: {
  accountId: string; accountName: string; initialTag: string; onClose: () => void;
  onChanged: (source: string, target: string) => void;
}) {
  const [source, setSource] = useState(initialTag);
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<TagChangePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function inspect() {
    if (busy) return;
    setPreview(null); setError(""); setSuccess("");
    if (!source.trim() || !target.trim() || source.trim() === target.trim() || /[,，\r\n]/.test(target)) {
      setError("请填写不同的新旧标签名称，新名称不能包含逗号或换行。"); return;
    }
    setBusy(true);
    try { setPreview(await api.previewTagChange({ source: source.trim(), target: target.trim(), ...(accountId ? { account_id: Number(accountId) } : {}) })); }
    catch (e) { setError(e instanceof Error ? e.message : "预览失败，请重试"); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!preview || busy || !preview.affected_reviews) return;
    setBusy(true); setError("");
    try {
      const result = await api.applyTagChange({ source: preview.source, target: preview.target, revision: preview.revision,
        ...(preview.account_id !== null ? { account_id: preview.account_id } : {}) });
      setSuccess(`已更新 ${result.updated_reviews} 份复盘的标签。`);
      setPreview(null); setSource(""); setTarget(""); onChanged(preview.source, preview.target);
    } catch (e) { setError(e instanceof Error ? e.message : "修改失败，请重新预览"); setPreview(null); }
    finally { setBusy(false); }
  }

  return <Drawer open direction="right" onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DrawerContent className="sm:max-w-2xl"><DrawerHeader><DrawerTitle>重命名／合并标签</DrawerTitle>
      <DrawerDescription>操作范围：{accountName}。包含草稿和待恢复笔记，不受复盘状态、关键词等其他筛选条件限制。</DrawerDescription>
    </DrawerHeader><ScrollArea className="min-h-0 flex-1 px-4 pb-6"><div className="flex flex-col gap-4">
      <FieldGroup>
        <Field><FieldLabel htmlFor="tag-change-source">原标签（精确名称）</FieldLabel><Input id="tag-change-source" maxLength={40} disabled={busy} value={source} onChange={(e) => { setSource(e.target.value); setPreview(null); setSuccess(""); }} /></Field>
        <Field><FieldLabel htmlFor="tag-change-target">新名称／合并到的标签</FieldLabel><Input id="tag-change-target" maxLength={40} disabled={busy} value={target} onChange={(e) => { setTarget(e.target.value); setPreview(null); setSuccess(""); }} /></Field>
      </FieldGroup>
      <p className="text-muted-foreground text-sm">新名称不存在时重命名；已存在时合并。同一复盘中的重复标签会去重，笔记内容和复盘状态保持不变。</p>
      <Button variant="outline" disabled={busy} onClick={inspect}>{busy ? "正在处理…" : "预览影响范围"}</Button>
      {preview && <Alert><AlertTitle>{preview.affected_reviews ? "请确认本次修改" : "没有需要修改的复盘"}</AlertTitle><AlertDescription>
        将“{preview.source}”改为“{preview.target}”，涉及 {preview.affected_accounts} 个账户、{preview.affected_reviews} 份复盘。
        目标标签已用于 {preview.target_reviews} 份复盘，其中 {preview.merged_reviews} 份与原标签重叠，会合并去重。
        此操作没有一键撤销；其他窗口已打开的复盘需要重新加载后保存。
      </AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <p role="status" className="text-sm">{success}</p>}
      {preview && preview.affected_reviews > 0 && <Button disabled={busy} onClick={apply}>确认更新 {preview.affected_reviews} 份复盘</Button>}
      <Button variant="outline" disabled={busy} onClick={onClose}>关闭</Button>
    </div></ScrollArea></DrawerContent>
  </Drawer>;
}
