"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, formatDateTime, type Account, type DailyReview } from "@/lib/tradesync/api";

export function DailyReviewCard({ accounts, timezone }: { accounts: Account[]; timezone: string }) {
  const [accountId, setAccountId] = useState(Number(accounts[0]?.id ?? 0)); const [date, setDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [data, setData] = useState<DailyReview | null>(null); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function load() { if (!accountId) return; setLoading(true); setError(""); try { setData(await api.dailyReview(accountId, date, timezone)); } catch (e) { setError(e instanceof Error ? e.message : "日总结读取失败"); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [accountId, date, timezone]);
  function patch(value: Partial<DailyReview>) { if (data) setData({ ...data, ...value }); }
  async function save(complete: boolean) { if (!data) return; setSaving(true); setError(""); try { setData(await api.saveDailyReview({ expected_revision: data.revision, account_id: accountId, review_date: date, timezone, plan_difference: data.plan_difference, execution_review: data.execution_review, keep_behavior: data.keep_behavior, main_problem: data.main_problem, next_action: data.next_action, no_new_action: data.no_new_action, data_reviewed: data.data_reviewed }, complete)); } catch (e) { setError(e instanceof Error ? e.message : "日总结保存失败"); } finally { setSaving(false); } }
  if (!accounts.length || !data) return null;
  const summary = data.current_summary;
  return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>盘后日总结</CardTitle><CardDescription>日总结与单笔复盘独立；仍有待复盘交易时也可以先写总结。</CardDescription></div><Badge variant={data.status === "completed" ? "default" : data.status === "needs_review" ? "destructive" : "secondary"}>{data.status === "completed" ? "已完成" : data.status === "needs_review" ? "数据变化待核对" : "草稿"}</Badge></div></CardHeader><CardContent className="space-y-5">
    <FieldGroup className="sm:flex-row sm:flex-wrap"><Field className="sm:w-auto"><FieldLabel>账户</FieldLabel><NativeSelect value={accountId} onChange={e => setAccountId(Number(e.target.value))}>{accounts.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.label || a.mt5_login}</NativeSelectOption>)}</NativeSelect></Field><Field className="sm:w-auto"><FieldLabel>总结日期</FieldLabel><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Button variant="outline" disabled={loading} onClick={load}>刷新当日汇总</Button></FieldGroup>
    {data.source_changed && <Alert><AlertTitle>当日数据发生变化</AlertTitle><AlertDescription>原总结和首次完成时间已保留。请核对当前汇总后重新提交。</AlertDescription></Alert>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[["净收益", summary.net_pnl.toLocaleString("zh-CN", { maximumFractionDigits: 2 })], ["完整交易", summary.closed_trades], ["原始成交", summary.deal_count], ["已复盘 / 待复盘", `${summary.reviewed} / ${summary.pending_reviews}`], ["已确认违规", summary.violations], ["关联模型", summary.setup_linked], ["交易意图", summary.intentions], ["已关联意图", summary.linked_intentions], ["待核对交易", summary.needs_review]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-muted-foreground text-xs">{label}</p><p className="font-semibold text-lg">{value}</p></div>)}</div>
    <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={data.data_reviewed} onCheckedChange={checked => patch({ data_reviewed: checked === true })} />我已查看以上当日交易与复盘汇总</label>
    <FieldGroup><Field><FieldLabel>计划与实际市场的主要差异</FieldLabel><Textarea value={data.plan_difference} onChange={e => patch({ plan_difference: e.target.value })} placeholder="没有明显差异时可以直接说明" /></Field><Field><FieldLabel>是否按照计划和停止条件执行</FieldLabel><Textarea value={data.execution_review} onChange={e => patch({ execution_review: e.target.value })} /></Field><Field><FieldLabel>今天应保留的一个行为</FieldLabel><Textarea value={data.keep_behavior} onChange={e => patch({ keep_behavior: e.target.value })} /></Field><Field><FieldLabel>今天最需要改进的问题</FieldLabel><Textarea value={data.main_problem} onChange={e => patch({ main_problem: e.target.value })} /></Field><Field><FieldLabel>下一个交易日的具体行动</FieldLabel><Textarea disabled={data.no_new_action} value={data.next_action} onChange={e => patch({ next_action: e.target.value })} /></Field></FieldGroup>
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={data.no_new_action} onCheckedChange={checked => { if (checked && data.next_action && !window.confirm("选择继续现有行动将清空已填写的新行动，确定继续吗？")) return; patch({ no_new_action: checked === true, next_action: checked ? "" : data.next_action }); }} />继续执行现有行动，无需新增行动</label>
    {data.first_completed_at && <p className="text-muted-foreground text-xs">首次完成：{formatDateTime(data.first_completed_at)}；最近完成：{formatDateTime(data.completed_at)}</p>}{error && <Alert variant="destructive"><AlertTitle>日总结未保存</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={saving} onClick={() => save(false)}>{saving ? "正在保存…" : "保存草稿"}</Button><Button disabled={saving} onClick={() => save(true)}>提交日总结</Button></div>
  </CardContent></Card>;
}
