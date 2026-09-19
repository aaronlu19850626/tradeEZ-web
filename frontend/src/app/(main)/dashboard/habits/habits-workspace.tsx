"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, formatDateTime, getToken, type HabitSummary, type Reminder } from "@/lib/tradesync/api";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const initialEnd = iso(new Date());
const initialStart = iso(new Date(Date.now() - 29 * 86400000));
const rate = (value: number | null) => value === null ? "暂无样本" : `${value.toFixed(1)}%`;

export function HabitsWorkspace() {
  const [start, setStart] = useState(initialStart); const [end, setEnd] = useState(initialEnd);
  const [summary, setSummary] = useState<HabitSummary | null>(null); const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState(""); const [dueAt, setDueAt] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function load() { setError(""); try { setSummary(await api.habitSummary(start, end)); setReminders(await api.reminders()); } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); } }
  useEffect(() => { if (!getToken()) { window.location.href = "/auth/v2/login"; return; } void load(); }, [start, end]);
  async function create() { if (!title.trim()) return; setBusy(true); try { await api.createReminder({ title: title.trim(), due_at: dueAt ? new Date(dueAt).toISOString() : null }); setTitle(""); setDueAt(""); await load(); } catch (e) { setError(e instanceof Error ? e.message : "提醒创建失败"); } finally { setBusy(false); } }
  async function change(item: Reminder, status: "done" | "snoozed") { let snoozed: string | null = null; if (status === "snoozed") { const value = window.prompt("请输入新的提醒时间，例如 2026-09-20 09:00"); if (!value) return; const parsed = new Date(value); if (Number.isNaN(parsed.valueOf())) { setError("新的提醒时间格式无效"); return; } snoozed = parsed.toISOString(); } setBusy(true); try { await api.updateReminder(item.id, { expected_revision: item.revision, status, snoozed_until: snoozed }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "提醒更新失败"); } finally { setBusy(false); } }
  return <div className="flex flex-col gap-6"><div><h1 className="text-3xl tracking-tight">习惯与提醒</h1><p className="text-muted-foreground text-sm">跟踪交易流程完成情况，并集中处理需要关注的事项。</p></div>
    <Card><CardHeader><CardTitle>过程习惯</CardTitle><CardDescription>按自然日统计计划和日总结；单笔复盘完成率按该范围内已结束交易统计。</CardDescription></CardHeader><CardContent className="space-y-4"><FieldGroup className="sm:flex-row"><Field><FieldLabel>开始日期</FieldLabel><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></Field><Field><FieldLabel>结束日期</FieldLabel><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field></FieldGroup>
      {summary && <div className="grid gap-3 md:grid-cols-3"><Metric title="盘前计划确认率" value={rate(summary.plans.rate)} detail={`${summary.plans.confirmed} 次确认 / ${summary.calendar_days} 天`} /><Metric title="日总结完成率" value={rate(summary.daily_reviews.rate)} detail={`${summary.daily_reviews.completed} 次完成 / ${summary.calendar_days} 天`} /><Metric title="单笔复盘完成率" value={rate(summary.trade_reviews.rate)} detail={`${summary.trade_reviews.completed} 笔完成 / ${summary.trade_reviews.total} 笔交易`} /></div>}
    </CardContent></Card>
    {error && <Alert variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>新增提醒</CardTitle><CardDescription>提醒只在站内显示，不会发送短信或邮件。</CardDescription></CardHeader><CardContent className="space-y-4"><FieldGroup><Field><FieldLabel>提醒内容</FieldLabel><Input maxLength={300} value={title} onChange={e => setTitle(e.target.value)} /></Field><Field><FieldLabel>提醒时间（可选）</FieldLabel><Input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></Field></FieldGroup><Button disabled={busy || !title.trim()} onClick={create}>创建提醒</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>提醒列表</CardTitle></CardHeader><CardContent className="space-y-3">{!reminders.length && <p className="text-muted-foreground text-sm">暂无提醒。</p>}{reminders.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><div className="flex gap-2"><p className="font-medium">{item.title}</p><Badge variant={item.status === "open" ? "default" : "secondary"}>{item.status === "open" ? "待处理" : item.status === "done" ? "已完成" : "稍后处理"}</Badge></div><p className="text-muted-foreground text-xs">{item.due_at ? `提醒时间：${formatDateTime(item.due_at)}` : "未设置提醒时间"}</p></div>{item.status !== "done" && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => change(item, "snoozed")}>稍后</Button><Button size="sm" disabled={busy} onClick={() => change(item, "done")}>完成</Button></div>}</div>)}</CardContent></Card>
  </div>;
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) { return <div className="rounded-lg border p-4"><p className="text-muted-foreground text-sm">{title}</p><p className="mt-1 font-semibold text-2xl">{value}</p><p className="text-muted-foreground text-xs">{detail}</p></div>; }
