"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type PlaybookRule, type PlaybookVersion, type Setup } from "@/lib/tradesync/api";

const sections = {
  market: "市场环境要求", locations: "关键位置", triggers: "触发条件", invalidations: "失效条件",
  risk: "风险约束", management: "持仓管理", exit: "退出原则", prohibited: "禁止事项",
} as const;
const groups = { environment: "市场环境", location: "关键位置", trigger: "触发", invalidation: "失效", risk: "风险", management: "管理", exit: "退出", prohibited: "禁止" } as const;
const checkpoints = { pre_trade: "交易前", entry: "入场", in_trade: "持仓中", exit: "退出", review: "复盘" } as const;

export default function PlaybooksPage() {
  const [items, setItems] = useState<Setup[]>([]); const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [symbols, setSymbols] = useState("");
  const [directions, setDirections] = useState<string[]>(["buy", "sell"]); const [draft, setDraft] = useState<PlaybookVersion | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? null;
  async function reload(prefer?: number) { try { const result = await api.setups(); setItems(result); setSelectedId(prefer ?? selectedId ?? result[0]?.id ?? null); } catch (e) { setError(e instanceof Error ? e.message : "模型读取失败"); } }
  useEffect(() => { void reload(); }, []);
  useEffect(() => { setDraft(selected?.draft ?? null); }, [selected?.id, selected?.draft]);
  async function create() {
    if (!name.trim()) { setError("请填写模型名称"); return; }
    setBusy(true); setError(""); try { const created = await api.createSetup({ name: name.trim(), description: description.trim(), symbols: symbols.split(/[,，]/).map(v => v.trim()).filter(Boolean), directions }); setName(""); setDescription(""); setSymbols(""); await reload(created.id); toast.success("交易模型已创建"); } catch (e) { setError(e instanceof Error ? e.message : "创建失败"); } finally { setBusy(false); }
  }
  async function ensureDraft() { if (!selected) return; setBusy(true); try { const value = await api.createPlaybookDraft(selected.id); setDraft(value); await reload(selected.id); } catch (e) { setError(e instanceof Error ? e.message : "草稿创建失败"); } finally { setBusy(false); } }
  async function toggleSetup() { if (!selected) return; setBusy(true); setError(""); try { await api.updateSetup(selected.id, { name: selected.name, description: selected.description, symbols: selected.symbols, directions: selected.directions, status: selected.status === "active" ? "disabled" : "active" }); await reload(selected.id); toast.success(selected.status === "active" ? "模型已停用" : "模型已启用"); } catch (e) { setError(e instanceof Error ? e.message : "状态更新失败"); } finally { setBusy(false); } }
  async function saveDraft() { if (!draft) return; setBusy(true); setError(""); try { const value = await api.savePlaybookDraft(draft.id, { expected_revision: draft.revision, content: draft.content, rules: draft.rules }); setDraft(value); await reload(selectedId ?? undefined); toast.success("Playbook 草稿已保存"); } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); } }
  async function publish() { if (!draft || !window.confirm(`发布版本 ${draft.version} 后不可修改，确定继续吗？`)) return; setBusy(true); setError(""); try { await api.publishPlaybook(draft.id, draft.revision); await reload(selectedId ?? undefined); toast.success("Playbook 已发布"); } catch (e) { setError(e instanceof Error ? e.message : "发布失败"); } finally { setBusy(false); } }
  function addRule() { if (!draft) return; const key = `rule_${Date.now()}`; setDraft({ ...draft, rules: [...draft.rules, { key, name: "", description: "", group: "trigger", checkpoint: "entry", answer_type: "boolean", evaluation: "manual", critical: false, allow_na: false, weight: 1, options: [], unit: "" }] }); }
  function updateRule(index: number, patch: Partial<PlaybookRule>) { if (!draft) return; setDraft({ ...draft, rules: draft.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) }); }

  return <div className="flex flex-col gap-6 p-4 lg:p-6"><div><h1 className="text-3xl tracking-tight">模型与规则</h1><p className="text-muted-foreground text-sm">管理 Setup，并将可执行规则发布为不可变版本。</p></div>
    {error && <Alert variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]"><div className="space-y-4"><Card><CardHeader><CardTitle>新建交易模型</CardTitle><CardDescription>例如趋势回踩、突破确认。</CardDescription></CardHeader><CardContent><FieldGroup>
      <Field><FieldLabel htmlFor="setup-name">名称</FieldLabel><Input id="setup-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="setup-description">说明</FieldLabel><Textarea id="setup-description" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="setup-symbols">适用品种</FieldLabel><Input id="setup-symbols" placeholder="XAUUSD, EURUSD；留空表示不限" value={symbols} onChange={e => setSymbols(e.target.value)} /></Field>
      <Field><FieldLabel>方向范围</FieldLabel><ToggleGroup type="multiple" variant="outline" value={directions} onValueChange={value => value.length && setDirections(value)}><ToggleGroupItem value="buy">做多</ToggleGroupItem><ToggleGroupItem value="sell">做空</ToggleGroupItem></ToggleGroup></Field>
      <Button disabled={busy} onClick={create}><Plus />创建模型</Button></FieldGroup></CardContent></Card>
      <div className="space-y-2">{items.map(item => <Button key={item.id} variant={item.id === selectedId ? "secondary" : "outline"} className="h-auto w-full justify-start p-3 text-left" onClick={() => setSelectedId(item.id)}><span className="flex-1"><span className="block font-medium">{item.name}</span><span className="block text-muted-foreground text-xs">{item.latest_published ? `已发布 v${item.latest_published.version}` : "尚未发布"}</span></span><Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status === "active" ? "启用" : "停用"}</Badge></Button>)}</div></div>
      <div>{!selected && <Card><CardContent className="py-10 text-center text-muted-foreground">创建或选择一个交易模型。</CardContent></Card>}{selected && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{selected.name}</CardTitle><CardDescription>{selected.description || "暂无说明"}</CardDescription></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={toggleSetup}>{selected.status === "active" ? "停用模型" : "启用模型"}</Button>{draft ? <Badge variant="secondary">草稿 v{draft.version}</Badge> : <Button onClick={ensureDraft} disabled={busy || selected.status === "disabled"}>创建新版本草稿</Button>}</div></div></CardHeader><CardContent className="space-y-6">
        {draft && <><FieldGroup>{Object.entries(sections).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={`section-${key}`}>{label}</FieldLabel><Textarea id={`section-${key}`} rows={3} value={draft.content[key] ?? ""} onChange={e => setDraft({ ...draft, content: { ...draft.content, [key]: e.target.value } })} /></Field>)}</FieldGroup>
        <div className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-semibold">执行规则</h2><p className="text-muted-foreground text-sm">每条规则只回答一个明确问题。</p></div><Button variant="outline" onClick={addRule}><Plus />添加规则</Button></div>
        {draft.rules.map((rule, index) => <div key={rule.key} className="space-y-3 rounded-lg border p-4"><div className="grid gap-3 md:grid-cols-2"><Field><FieldLabel>规则名称</FieldLabel><Input maxLength={120} value={rule.name} onChange={e => updateRule(index, { name: e.target.value })} /></Field><Field><FieldLabel>权重</FieldLabel><Input type="number" min="0.1" max="100" step="0.1" disabled={rule.answer_type === "text"} value={rule.weight} onChange={e => updateRule(index, { weight: Number(e.target.value) })} /></Field><Field><FieldLabel>分组</FieldLabel><NativeSelect className="w-full" value={rule.group} onChange={e => updateRule(index, { group: e.target.value as PlaybookRule["group"] })}>{Object.entries(groups).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel>检查时点</FieldLabel><NativeSelect className="w-full" value={rule.checkpoint} onChange={e => updateRule(index, { checkpoint: e.target.value as PlaybookRule["checkpoint"] })}>{Object.entries(checkpoints).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel>回答形式</FieldLabel><NativeSelect className="w-full" value={rule.answer_type} onChange={e => updateRule(index, { answer_type: e.target.value as PlaybookRule["answer_type"], options: e.target.value === "choice" ? rule.options : [] })}><NativeSelectOption value="boolean">是／否</NativeSelectOption><NativeSelectOption value="number">数值</NativeSelectOption><NativeSelectOption value="choice">选项</NativeSelectOption><NativeSelectOption value="text">文本记录</NativeSelectOption></NativeSelect></Field><Field><FieldLabel>评估方式</FieldLabel><NativeSelect className="w-full" value={rule.evaluation} onChange={e => updateRule(index, { evaluation: e.target.value as PlaybookRule["evaluation"] })}><NativeSelectOption value="manual">人工评估</NativeSelectOption><NativeSelectOption value="deterministic">确定性自动评估</NativeSelectOption></NativeSelect></Field></div>{rule.answer_type === "choice" && <Field><FieldLabel>选项（逗号分隔）</FieldLabel><Input value={rule.options.join(", ")} onChange={e => updateRule(index, { options: e.target.value.split(/[,，]/).map(value => value.trim()).filter(Boolean) })} /></Field>}{rule.answer_type === "number" && <Field><FieldLabel>数值单位</FieldLabel><Input maxLength={30} placeholder="例如 %、USD、点" value={rule.unit} onChange={e => updateRule(index, { unit: e.target.value })} /></Field>}<Field><FieldLabel>判定说明</FieldLabel><Textarea maxLength={1000} value={rule.description} onChange={e => updateRule(index, { description: e.target.value })} /></Field><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm"><Checkbox checked={rule.critical} onCheckedChange={value => updateRule(index, { critical: value === true, allow_na: value === true ? false : rule.allow_na })} />关键规则</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={rule.allow_na} disabled={rule.critical} onCheckedChange={value => updateRule(index, { allow_na: value === true })} />允许不适用</label><Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}><Trash2 />移除</Button></div></div>)}</div>
        <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={busy} onClick={saveDraft}>{busy ? "正在保存…" : "保存草稿"}</Button><Button disabled={busy} onClick={publish}>发布版本 {draft.version}</Button></div></>}
      </CardContent></Card>}</div></div></div>;
}
