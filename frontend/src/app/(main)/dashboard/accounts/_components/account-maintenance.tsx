"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, type Account } from "@/lib/tradesync/api";
import { EaConnection } from "./ea-connection";

const names: Record<string, string> = { review_attachments: "复盘截图", trade_reviews: "复盘笔记与标签", deals: "原始成交", snapshots: "账户资金快照", trade_lifecycles: "派生交易", sync_runs: "同步轮次", sync_batches: "同步批次", symbols: "品种规格", ea_settings_history: "EA 参数快照", heartbeat_history: "历史心跳", heartbeats: "当前心跳", ea_instances: "EA 实例", api_logs: "接口日志" };
const resetTables = new Set(["deals", "snapshots", "trade_lifecycles", "sync_runs", "sync_batches"]);

export function AccountMaintenance({ account, action, onClose, onChanged }: {
  account: Account; action: "reset" | "delete"; onClose: () => void; onChanged: () => void;
}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.maintenancePreview>> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [newKey, setNewKey] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setPreview(null); setError(""); setConfirmation("");
    api.maintenancePreview(account.id).then((result) => { if (active) setPreview(result); })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account.id, revision]);

  async function execute() {
    if (!preview || saving || confirmation !== preview.mt5_login) return;
    const start = Date.parse(`${date}T00:00:00Z`) / 1000;
    if (action === "reset" && (!date || !Number.isFinite(start) || start < 0 || start > Date.now() / 1000)) {
      setError("请重新选择有效的同步日期，不能晚于今天 UTC。"); return;
    }
    setSaving(true); setError("");
    try {
      if (reason.trim().length < 3) { setError("请填写至少 3 个字符的操作原因。"); setSaving(false); return; }
      const payload = { confirm_login: confirmation, revision: preview.revision, reason: reason.trim() };
      if (action === "reset") {
        const result = await api.resetSync(account.id, { ...payload, sync_start_time: start });
        setNewKey(result.sync_key); onChanged();
      } else {
        await api.deleteAccount(account.id, payload); onChanged(); onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败"); setPreview(null); setConfirmation("");
    } finally { setSaving(false); }
  }

  return <Drawer open onOpenChange={(open) => { if (!open && !saving) onClose(); }} direction="right">
    <DrawerContent className="sm:max-w-2xl"><DrawerHeader><DrawerTitle>{newKey ? "等待重新同步" : action === "reset" ? "清空并重新同步" : "删除账户"}</DrawerTitle>
      <DrawerDescription>{account.label || account.mt5_login} · {account.mt5_login}</DrawerDescription></DrawerHeader>
      <ScrollArea className="min-h-0 flex-1 px-4 pb-6"><div className="flex flex-col gap-4">
        {newKey ? <>
          <Alert><AlertTitle>旧密钥已失效</AlertTitle><AlertDescription>复制新参数并更新 EA。新密钥仅本次显示，关闭后无法再次查看。账户原有启停状态保留，停用账户需先恢复同步。</AlertDescription></Alert>
          <EaConnection syncKey={newKey} disabled={account.status === "disabled"} />
          <Button onClick={onClose}>已保存新密钥，完成</Button>
        </> : <>
          <Alert variant="destructive"><AlertTitle>{action === "reset" ? "此操作会清空交易数据并更换密钥" : "此操作无法通过页面撤销"}</AlertTitle>
            <AlertDescription>{action === "reset" ? "成交、派生交易、资金快照及同步批次将清空；品种规格、EA 参数和接口日志保留。旧密钥立即失效，需在 EA 更新新密钥。" : "该账户的成交、交易、资金快照、参数、密钥关联及日志将物理删除，旧 EA 请求被拒绝。备份不会随本操作清除。"}
              重同步会保留账户备注，并保留复盘笔记、标签与截图作为待恢复资料；删除账户会一并删除这些资料。共享计划尚未开放。建议先暂停 EA 同步，避免确认期间数据变化。
            </AlertDescription></Alert>
          {loading && <Skeleton className="h-40 w-full" />}
          {preview && <Table><TableHeader><TableRow><TableHead>数据</TableHead><TableHead>当前数量</TableHead><TableHead>处理方式</TableHead></TableRow></TableHeader>
            <TableBody>{Object.entries(preview.counts).map(([name, count]) => <TableRow key={name}><TableCell>{names[name] || name}</TableCell><TableCell>{count}</TableCell>
              <TableCell>{action === "delete" || resetTables.has(name) ? "清除" : "保留"}</TableCell></TableRow>)}</TableBody></Table>}
          <FieldGroup>
            {action === "reset" && <Field><FieldLabel htmlFor="reset-sync-date">重新选择同步开始日期（UTC）</FieldLabel>
              <Input id="reset-sync-date" type="date" min="1970-01-01" max={new Date().toISOString().slice(0, 10)} value={date} disabled={saving} onChange={(e) => setDate(e.target.value)} />
              <p className="text-muted-foreground text-xs">{date ? `${date} 00:00:00 UTC 起，按平仓时间包含当天。` : "必须重新选择日期，历史范围受 MT5 可获取数据限制。"}</p></Field>}
            <Field><FieldLabel htmlFor="maintenance-confirm">输入完整 MT5 登录号 {account.mt5_login} 确认</FieldLabel>
              <Input id="maintenance-confirm" autoComplete="off" value={confirmation} disabled={saving} onChange={(e) => setConfirmation(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="maintenance-reason">操作原因（必填，至少 3 个字符）</FieldLabel>
              <Textarea id="maintenance-reason" maxLength={500} value={reason} disabled={saving} onChange={(e) => setReason(e.target.value)} placeholder={action === "reset" ? "例如：修复历史成交缺失，重新同步最近三个月" : "例如：该模拟账户已停用，不再保留数据"} /></Field>
          </FieldGroup>
          {error && <Alert variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <Button variant="outline" disabled={loading || saving} onClick={() => setRevision((v) => v + 1)}>重新加载影响范围</Button>
          <Button variant="destructive" disabled={saving || loading || !preview || confirmation !== preview.mt5_login || reason.trim().length < 3 || (action === "reset" && !date)} onClick={execute}>
            {saving ? "正在处理…" : action === "reset" ? "确认清空并重新生成密钥" : "确认永久删除账户"}</Button>
          <Button variant="outline" disabled={saving} onClick={onClose}>取消</Button>
        </>}
      </div></ScrollArea>
    </DrawerContent>
  </Drawer>;
}

