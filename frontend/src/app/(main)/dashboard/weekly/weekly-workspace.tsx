"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, getToken, type ImprovementAction, type WeeklyReview } from "@/lib/tradesync/api";

function monday() { const value = new Date(); const day = value.getDay() || 7; value.setDate(value.getDate() - day + 1); return value.toISOString().slice(0, 10); }

export function WeeklyWorkspace() {
  const [week, setWeek] = useState(monday()); const [review, setReview] = useState<WeeklyReview | null>(null);
  const [actions, setActions] = useState<ImprovementAction[]>([]); const [title, setTitle] = useState(""); const [measure, setMeasure] = useState(""); const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function load() { setError(""); try { const item = await api.weeklyReview(week); setReview(item); setActions(await api.improvementActions()); } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); } }
  useEffect(() => { if (!getToken()) { window.location.href = "/auth/v2/login"; return; } void load(); }, [week]);
  function patch(value: Partial<WeeklyReview>) { if (review) setReview({ ...review, ...value }); }
  async function save(complete: boolean) { if (!review) return; setBusy(true); setError(""); try { setReview(await api.saveWeeklyReview({ expected_revision: review.revision, week_start: week, achievements: review.achievements, recurring_problems: review.recurring_problems, next_focus: review.next_focus }, complete)); } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); } }
  async function createAction() { if (!title.trim()) return; setBusy(true); try { await api.createImprovementAction({ weekly_review_id: review?.id, title: title.trim(), success_measure: measure.trim(), target_date: targetDate || null }); setTitle(""); setMeasure(""); setTargetDate(""); await load(); } catch (e) { setError(e instanceof Error ? e.message : "行动创建失败"); } finally { setBusy(false); } }
  async function transition(item: ImprovementAction, status: "completed" | "abandoned") { const outcome = window.prompt(status === "completed" ? "请填写完成结果" : "请填写放弃原因")?.trim(); if (!outcome) return; setBusy(true); try { await api.updateImprovementAction(item.id, { expected_revision: item.revision, status, outcome }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "状态更新失败"); } finally { setBusy(false); } }
  const s = review?.current_summary;
  return <div className="flex flex-col gap-6"><div><h1 className="text-3xl tracking-tight">周复盘与改进行动</h1><p className="text-muted-foreground text-sm">汇总每日复盘，识别重复问题，并把下周重点转换成可跟踪行动。</p></div>
    <Field className="max-w-xs"><FieldLabel htmlFor="week-start">周起始日期（星期一）</FieldLabel><Input id="week-start" type="date" value={week} onChange={e => setWeek(e.target.value)} /></Field>
    {error && <Alert variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {review && <Card><CardHeader><div className="flex justify-between gap-3"><div><CardTitle>本周汇总</CardTitle><CardDescription>数据来自该周已保存的日总结。</CardDescription></div><Badge>{review.status === "completed" ? "已完成" : review.status === "needs_review" ? "数据变化待核对" : "草稿"}</Badge></div></CardHeader><CardContent className="space-y-5">
      {s && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["已记录天数", s.days_recorded],["已完成日总结", s.days_completed],["完整交易", s.closed_trades],["已复盘 / 待复盘", `${s.reviewed} / ${s.pending_reviews}`],["净收益", s.net_pnl.toLocaleString("zh-CN", { maximumFractionDigits: 2 })],["违规", s.violations]].map(([label,value]) => <div className="rounded-lg border p-3" key={label}><p className="text-muted-foreground text-xs">{label}</p><p className="font-semibold text-lg">{value}</p></div>)}</div>}
      <FieldGroup><Field><FieldLabel>本周做得好的地方</FieldLabel><Textarea value={review.achievements} onChange={e => patch({ achievements: e.target.value })} /></Field><Field><FieldLabel>反复出现的问题</FieldLabel><Textarea value={review.recurring_problems} onChange={e => patch({ recurring_problems: e.target.value })} /></Field><Field><FieldLabel>下周唯一改进重点</FieldLabel><Textarea value={review.next_focus} onChange={e => patch({ next_focus: e.target.value })} /></Field></FieldGroup>
      <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => save(false)}>保存草稿</Button><Button disabled={busy} onClick={() => save(true)}>提交周复盘</Button></div>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>新增改进行动</CardTitle><CardDescription>行动应具体、可验证，并设置一个检查日期。</CardDescription></CardHeader><CardContent className="space-y-4"><FieldGroup><Field><FieldLabel>行动内容</FieldLabel><Input maxLength={300} value={title} onChange={e => setTitle(e.target.value)} /></Field><Field><FieldLabel>完成标准</FieldLabel><Textarea maxLength={1000} value={measure} onChange={e => setMeasure(e.target.value)} /></Field><Field><FieldLabel>检查日期</FieldLabel><Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} /></Field></FieldGroup><Button disabled={busy || !title.trim()} onClick={createAction}>创建行动</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>行动跟踪</CardTitle></CardHeader><CardContent className="space-y-3">{!actions.length && <p className="text-muted-foreground text-sm">暂无行动。</p>}{actions.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"><div><div className="flex gap-2"><p className="font-medium">{item.title}</p><Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status === "active" ? "进行中" : item.status === "completed" ? "已完成" : "已放弃"}</Badge></div><p className="text-muted-foreground text-sm">完成标准：{item.success_measure || "未填写"} · 检查日期：{item.target_date || "未设置"}</p>{item.outcome && <p className="mt-1 text-sm">结果：{item.outcome}</p>}</div>{item.status === "active" && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => transition(item, "abandoned")}>放弃</Button><Button size="sm" disabled={busy} onClick={() => transition(item, "completed")}>完成</Button></div>}</div>)}</CardContent></Card>
  </div>;
}
