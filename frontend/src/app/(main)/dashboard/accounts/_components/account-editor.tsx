"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type Account } from "@/lib/tradesync/api";

export function AccountEditor({ account: initialAccount, onSaved, onClose }: {
  account: Account; onSaved: (account: Account) => void; onClose: () => void;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [label, setLabel] = useState(account.label ?? "");
  const [notes, setNotes] = useState(account.notes ?? "");
  const [server, setServer] = useState(account.broker_server ?? "");
  const [currency, setCurrency] = useState(account.account_currency ?? "");
  const [timezone, setTimezone] = useState(account.server_timezone_name ?? "");
  const initialDate = account.sync_start_time ? new Date(account.sync_start_time * 1000).toISOString().slice(0, 10) : "";
  const [date, setDate] = useState(initialDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = account.sync_start_locked || account.deal_count > 0 || account.last_sync_time > 0;
  const dirty = notes !== (account.notes ?? "") || label !== (account.label ?? "") || server !== (account.broker_server ?? "") || currency !== (account.account_currency ?? "") || timezone !== (account.server_timezone_name ?? "") || date !== initialDate;
  function close() {
    if (!saving && (!dirty || window.confirm("账户配置尚未保存，确定放弃修改吗？"))) onClose();
  }

  async function save() {
    if (saving) return;
    if (!server.trim() && account.broker_server) { setError("已有券商服务器不能清空。"); return; }
    if (timezone.trim()) {
      try { new Intl.DateTimeFormat("en", { timeZone: timezone.trim() }); }
      catch { setError("请输入有效 IANA 时区，例如 Europe/Helsinki。"); return; }
    }
    const payload: Record<string, unknown> = { label: label.trim() || null, notes: notes.trim() || null,
      expected_revision: account.config_revision,
      account_currency: currency.trim().toUpperCase() || null, server_timezone_name: timezone.trim() || null };
    if (server.trim()) payload.broker_server = server.trim();
    if (date !== initialDate) {
      const value = Date.parse(`${date}T00:00:00Z`) / 1000;
      if (!Number.isFinite(value) || value < 0 || value > Date.now() / 1000) {
        setError("请选择有效且不晚于今天 UTC 的同步开始日期。"); return;
      }
      payload.sync_start_time = value;
    }
    setSaving(true); setError("");
    try {
      onSaved(await api.updateAccount(account.id, payload));
      toast.success("账户配置已保存"); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试"); }
    finally { setSaving(false); }
  }

  async function reload() {
    if (saving || (dirty && !window.confirm("读取最新配置将替换当前未保存草稿，确定继续吗？"))) return;
    setSaving(true); setError("");
    try {
      const latest = await api.account(account.id);
      setAccount(latest); setLabel(latest.label ?? ""); setNotes(latest.notes ?? "");
      setServer(latest.broker_server ?? ""); setCurrency(latest.account_currency ?? "");
      setTimezone(latest.server_timezone_name ?? "");
      setDate(latest.sync_start_time ? new Date(latest.sync_start_time * 1000).toISOString().slice(0, 10) : "");
      toast.success("已读取最新账户配置");
    } catch (e) { setError(e instanceof Error ? e.message : "读取失败，草稿仍保留"); }
    finally { setSaving(false); }
  }

  return <Drawer open onOpenChange={(open) => { if (!open) close(); }} direction="right">
    <DrawerContent className="sm:max-w-2xl"><DrawerHeader><DrawerTitle>账户配置</DrawerTitle>
      <DrawerDescription>MT5 登录号 {account.mt5_login}。修改币种仅更正金额单位，不进行汇率换算。</DrawerDescription></DrawerHeader>
      <ScrollArea className="min-h-0 flex-1 px-4 pb-6"><div className="flex flex-col gap-4">
        <fieldset disabled={saving}><FieldGroup>
          <Field><FieldLabel htmlFor="account-label">显示名称</FieldLabel><Input id="account-label" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="account-server">券商服务器</FieldLabel><Input id="account-server" maxLength={120} value={server} onChange={(e) => setServer(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="account-currency">账户币种</FieldLabel><Input id="account-currency" maxLength={10} placeholder="例如 USD、USC" value={currency} onChange={(e) => setCurrency(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="account-timezone">MT5 服务器时区（可选）</FieldLabel><Input id="account-timezone" maxLength={64} placeholder="例如 Europe/Helsinki" value={timezone} onChange={(e) => setTimezone(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="account-start">同步开始日期（UTC）</FieldLabel><Input id="account-start" type="date" min="1970-01-01" max={new Date().toISOString().slice(0, 10)} disabled={locked} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="account-notes">账户备注（可选）</FieldLabel>
            <Textarea id="account-notes" maxLength={2000} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} aria-describedby="account-notes-help" placeholder="记录账户用途、交易限制或需要注意的事项" />
            <p id="account-notes-help" className="text-muted-foreground text-xs">{notes.length}/2000 字符。仅自己可见；重同步保留，删除账户时一并删除。</p>
          </Field>
        </FieldGroup></fieldset>
        <Alert><AlertTitle>时间口径与历史数据</AlertTitle><AlertDescription>
          {date ? `同步从 ${date} 00:00:00 UTC 开始，按平仓时间判断，包含当天。` : "旧账户未设置同步起点，EA 首次同步使用自身回溯范围。"}
          服务器时区是账户说明，不会重新解释已保存的 UTC 成交。
          {locked ? " 已开始同步的账户不能在普通配置中更改起点。" : " 一旦 EA 开始同步，需要通过重新同步流程更改起点。"}
        </AlertDescription></Alert>
        {error && <Alert variant="destructive"><AlertTitle>保存失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <Button disabled={saving} onClick={save}>{saving ? "正在保存…" : "保存账户配置"}</Button>
        <Button variant="outline" disabled={saving} onClick={reload}>读取最新配置</Button>
        <Button variant="outline" disabled={saving} onClick={close}>取消</Button>
      </div></ScrollArea>
    </DrawerContent>
  </Drawer>;
}
