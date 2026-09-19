"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getToken, type WorkspaceSettings } from "@/lib/tradesync/api";

const defaults: WorkspaceSettings = { display_timezone: "Asia/Shanghai", trading_day_start: "00:00", default_session: "全天", revision: 0, updated_at: null };

export function SettingsWorkspace() {
  const [data, setData] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!getToken()) { window.location.href = "/auth/v2/login"; return; }
    api.workspaceSettings().then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const saved = await api.saveWorkspaceSettings({ expected_revision: data.revision, display_timezone: data.display_timezone,
        trading_day_start: data.trading_day_start, default_session: data.default_session });
      setData(saved); setSuccess("工作区设置已保存。");
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试"); }
    finally { setSaving(false); }
  }

  return <div className="flex flex-col gap-6">
    <div><h1 className="text-3xl tracking-tight">工作区设置</h1><p className="text-muted-foreground text-sm">统一交易计划、复盘、分析和日历使用的时间口径。</p></div>
    {loading ? <Skeleton className="h-72 w-full" /> : <Card><CardHeader><CardTitle>时间与交易日</CardTitle>
      <CardDescription>修改交易日分界会影响后续日期归属；已经保存的计划和日总结保留原有日期。</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">
      <FieldGroup>
        <Field><FieldLabel htmlFor="workspace-timezone">展示时区</FieldLabel><NativeSelect id="workspace-timezone" value={data.display_timezone} onChange={e => setData({ ...data, display_timezone: e.target.value })}>
          <NativeSelectOption value="Asia/Shanghai">北京时间（Asia/Shanghai）</NativeSelectOption>
          <NativeSelectOption value="UTC">协调世界时（UTC）</NativeSelectOption>
          <NativeSelectOption value="Europe/London">伦敦（Europe/London）</NativeSelectOption>
          <NativeSelectOption value="America/New_York">纽约（America/New_York）</NativeSelectOption>
        </NativeSelect></Field>
        <Field><FieldLabel htmlFor="workspace-day-start">交易日分界时间</FieldLabel><Input id="workspace-day-start" type="time" value={data.trading_day_start} onChange={e => setData({ ...data, trading_day_start: e.target.value })} /></Field>
        <Field><FieldLabel htmlFor="workspace-session">默认交易时段</FieldLabel><NativeSelect id="workspace-session" value={data.default_session} onChange={e => setData({ ...data, default_session: e.target.value })}>
          <NativeSelectOption value="全天">全天</NativeSelectOption><NativeSelectOption value="亚洲时段">亚洲时段</NativeSelectOption>
          <NativeSelectOption value="伦敦时段">伦敦时段</NativeSelectOption><NativeSelectOption value="纽约时段">纽约时段</NativeSelectOption>
        </NativeSelect></Field>
      </FieldGroup>
      <p className="text-muted-foreground text-xs">例如分界时间设置为 06:00，则当天 00:00–05:59 的记录归入前一个交易日。伦敦和纽约时区会自动应用夏令时规则。</p>
      {error && <Alert variant="destructive"><AlertTitle>设置未保存</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <p role="status" className="text-sm">{success}</p>}
      <Button className="self-start" disabled={saving || !data.trading_day_start} onClick={save}>{saving ? "正在保存…" : "保存设置"}</Button>
    </CardContent></Card>}
  </div>;
}
