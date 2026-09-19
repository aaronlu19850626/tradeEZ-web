"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type EvaluationChoice, type ReviewEvaluation, type RuleAnswer } from "@/lib/tradesync/api";

const statusLabels = { pass: "通过", fail: "未通过", unknown: "无法判断", na: "不适用" } as const;

export function RuleEvaluation({ reviewId }: { reviewId: number }) {
  const [choices, setChoices] = useState<EvaluationChoice[]>([]); const [evaluation, setEvaluation] = useState<ReviewEvaluation | null>(null);
  const [versionId, setVersionId] = useState(0); const [answers, setAnswers] = useState<RuleAnswer[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const selected = choices.find(choice => choice.id === versionId);
  useEffect(() => { let active = true; api.reviewEvaluation(reviewId).then(result => { if (!active) return; setChoices(result.choices); setEvaluation(result.evaluation); setVersionId(result.evaluation?.playbook_version_id ?? result.choices[0]?.id ?? 0); setAnswers(result.evaluation?.answers ?? []); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "规则评价读取失败"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [reviewId]);
  function answer(ruleKey: string, patch: Partial<RuleAnswer>) { const current = answers.find(item => item.rule_key === ruleKey) ?? { rule_key: ruleKey, status: "unknown" as const, evidence: "", value: "" }; setAnswers([...answers.filter(item => item.rule_key !== ruleKey), { ...current, ...patch }]); }
  async function save() { if (!versionId || saving) return; setSaving(true); setError(""); try { const result = await api.saveReviewEvaluation(reviewId, { expected_revision: evaluation?.revision ?? 0, playbook_version_id: versionId, answers }); setEvaluation(result); setAnswers(result.answers); } catch (e) { setError(e instanceof Error ? e.message : "规则评价保存失败"); } finally { setSaving(false); } }
  if (loading) return <p className="text-muted-foreground text-sm">正在读取执行规则…</p>;
  return <Card><CardHeader><CardTitle>执行规则评价</CardTitle><CardDescription>关联发布版本并逐条记录依据。无法判断需要填写原因。</CardDescription></CardHeader><CardContent className="space-y-4">
    {choices.length === 0 && <Alert><AlertTitle>暂无已发布 Playbook</AlertTitle><AlertDescription>请先在“模型与规则”中发布一个版本；未关联规则仍可完成复盘。</AlertDescription></Alert>}
    {choices.length > 0 && <><Field><FieldLabel htmlFor="evaluation-playbook">Playbook 版本</FieldLabel><NativeSelect id="evaluation-playbook" className="w-full" disabled={saving} value={versionId} onChange={e => { setVersionId(Number(e.target.value)); setAnswers([]); }}><NativeSelectOption value={0}>请选择</NativeSelectOption>{choices.map(choice => <NativeSelectOption key={choice.id} value={choice.id} disabled={!choice.active && choice.id !== evaluation?.playbook_version_id}>{choice.setup_name} · v{choice.version}{choice.active ? "" : "（已停用）"}</NativeSelectOption>)}</NativeSelect></Field>
    {evaluation && <div className="flex flex-wrap gap-2"><Badge variant={evaluation.complete ? "default" : "secondary"}>{evaluation.complete ? "评价完整" : "尚未完成"}</Badge><Badge variant="outline">证据覆盖率 {evaluation.coverage === null ? "不适用" : `${Math.round(evaluation.coverage * 100)}%`}</Badge><Badge variant="outline">执行分 {evaluation.score === null ? "暂不计算" : evaluation.score.toFixed(1)}</Badge>{evaluation.critical_failures.length > 0 && <Badge variant="destructive">关键违规 {evaluation.critical_failures.length}</Badge>}</div>}
    <div className="space-y-3">{selected?.rules.map(rule => { const current = answers.find(item => item.rule_key === rule.key); return <div key={rule.key} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{rule.name}</p><p className="text-muted-foreground text-sm">{rule.description || "未填写判定说明"}</p></div><div className="flex gap-1">{rule.critical && <Badge variant="destructive">关键</Badge>}{rule.answer_type !== "text" && <Badge variant="outline">权重 {rule.weight}</Badge>}</div></div>
      {rule.answer_type === "text" && <Field><FieldLabel htmlFor={`rule-value-${rule.key}`}>记录内容</FieldLabel><Textarea id={`rule-value-${rule.key}`} value={current?.value ?? ""} onChange={e => answer(rule.key, { value: e.target.value, status: "pass" })} /></Field>}
      <ToggleGroup type="single" variant="outline" value={current?.status ?? ""} onValueChange={value => value && answer(rule.key, { status: value as RuleAnswer["status"] })}><ToggleGroupItem value="pass">通过</ToggleGroupItem><ToggleGroupItem value="fail">未通过</ToggleGroupItem><ToggleGroupItem value="unknown">无法判断</ToggleGroupItem>{rule.allow_na && <ToggleGroupItem value="na">不适用</ToggleGroupItem>}</ToggleGroup>
      {(current?.status === "unknown" || current?.status === "fail" || current?.status === "na") && <Field><FieldLabel htmlFor={`rule-evidence-${rule.key}`}>{current.status === "unknown" ? "无法判断原因" : "证据或说明"}</FieldLabel><Input id={`rule-evidence-${rule.key}`} maxLength={2000} value={current.evidence} onChange={e => answer(rule.key, { evidence: e.target.value })} /></Field>}
    </div>; })}</div><Button className="w-full" disabled={saving || !versionId} onClick={save}>{saving ? "正在保存…" : "保存规则评价"}</Button></>}
    {error && <Alert variant="destructive"><AlertTitle>规则评价未保存</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
  </CardContent></Card>;
}
