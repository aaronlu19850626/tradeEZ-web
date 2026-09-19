"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, getToken, type Account, type TagDefinition } from "@/lib/tradesync/api";
import { ReviewTags } from "../_components/review-tags";
import { TagManager } from "../reviews/tag-manager";

export function TagWorkspace() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [revision, setRevision] = useState(0);
  const [managerOpen, setManagerOpen] = useState(false);
  const [error, setError] = useState("");
  const [definitions, setDefinitions] = useState<TagDefinition[]>([]);

  useEffect(() => {
    if (!getToken()) { window.location.href = "/auth/v2/login"; return; }
    let active = true;
    Promise.all([api.accounts().catch(() => api.accounts()), api.tagDefinitions().catch(() => api.tagDefinitions())]).then(([items, tags]) => { if (active) { setAccounts(items); setDefinitions(tags); setError(""); } })
      .catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [revision]);

  const account = accounts.find((item) => String(item.id) === accountId);
  const accountName = accountId
    ? account?.label ? `${account.label} · ${account.mt5_login}` : `账户 ${account?.mt5_login ?? accountId}`
    : "我的全部账户";
  async function updateDefinition(item: TagDefinition, values: Partial<Pick<TagDefinition, "group_name" | "status">>) {
    setError("");
    try { await api.updateTagDefinition(item.id, { expected_revision: item.revision, group_name: values.group_name ?? item.group_name, status: values.status ?? item.status }); setRevision(value => value + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "标签设置保存失败"); }
  }

  return <div className="flex flex-col gap-6">
    <div><h1 className="text-3xl tracking-tight">标签管理</h1>
      <p className="text-muted-foreground text-sm">查看标签使用次数，按账户筛选，并安全地重命名或合并复盘标签。</p></div>
    {error && <Alert variant="destructive"><AlertTitle>账户加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>标签范围</CardTitle>
      <CardDescription>标签来自已保存的交易复盘，包含草稿和待恢复资料。</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field className="max-w-sm"><FieldLabel htmlFor="tag-account">账户</FieldLabel>
          <NativeSelect id="tag-account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setSelectedTag(""); }}>
            <NativeSelectOption value="">全部账户</NativeSelectOption>
            {accounts.map((item) => <NativeSelectOption key={item.id} value={String(item.id)}>{item.label ? `${item.label} · ${item.mt5_login}` : item.mt5_login}</NativeSelectOption>)}
          </NativeSelect></Field>
        <ReviewTags accountId={accountId} revision={revision} selected={selectedTag ? [selectedTag] : []} onSelect={setSelectedTag} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!selectedTag} onClick={() => setManagerOpen(true)}>{selectedTag ? `修改“${selectedTag}”` : "请先选择标签"}</Button>
          <Button variant="outline" disabled={!selectedTag || !accountId} asChild={Boolean(selectedTag && accountId)}>
            {selectedTag && accountId ? <a href={`/dashboard/analytics?account_id=${accountId}&tag=${encodeURIComponent(selectedTag)}`}>查看该标签的交易分析</a> : <span>选择账户后查看分析</span>}
          </Button>
          <Button variant="outline" disabled={!selectedTag} asChild={Boolean(selectedTag)}>
            {selectedTag ? <a href={`/dashboard/reviews?tag=${encodeURIComponent(selectedTag)}`}>查看相关复盘</a> : <span>查看相关复盘</span>}
          </Button>
        </div>
      </CardContent></Card>
    <Card><CardHeader><CardTitle>操作说明</CardTitle></CardHeader><CardContent className="text-muted-foreground space-y-2 text-sm">
      <p>输入一个尚不存在的新名称会执行重命名；输入已有标签名称会执行合并并自动去重。</p>
      <p>提交前会显示受影响的账户和复盘数量。每份被修改的复盘都会增加版本号并保留版本记录。</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>标签分组与状态</CardTitle><CardDescription>停用标签仍保留在历史复盘中，但不建议继续用于新复盘。</CardDescription></CardHeader><CardContent className="space-y-3">
      {!definitions.length && <p className="text-muted-foreground text-sm">暂无标签定义；在复盘中保存标签后会自动建立。</p>}
      {definitions.map(item => <div key={item.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_auto] md:items-end"><div><p className="font-medium">{item.name}</p><p className="text-muted-foreground text-xs">用于 {item.review_count} 份复盘 · {item.status === "active" ? "启用" : "已停用"}</p></div>
        <Field><FieldLabel>分组</FieldLabel><Input maxLength={40} defaultValue={item.group_name} onBlur={e => { const value = e.target.value.trim(); if (value && value !== item.group_name) void updateDefinition(item, { group_name: value }); }} /></Field>
        <Button variant="outline" onClick={() => updateDefinition(item, { status: item.status === "active" ? "disabled" : "active" })}>{item.status === "active" ? "停用" : "重新启用"}</Button></div>)}
    </CardContent></Card>
    {managerOpen && <TagManager accountId={accountId} accountName={accountName} initialTag={selectedTag}
      onClose={() => setManagerOpen(false)} onChanged={(_source, target) => { setSelectedTag(target); setRevision((value) => value + 1); }} />}
  </div>;
}
