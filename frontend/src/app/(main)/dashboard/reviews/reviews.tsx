"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Account } from "@/lib/tradesync/api";
import { api, getToken, formatDateTime, type Page, type ReviewListItem } from "@/lib/tradesync/api";
import { TradeDetailDrawer } from "../orders/_components/trade-detail";
import { ReviewTags } from "../_components/review-tags";
import { TagManager } from "./tag-manager";
import { ReviewAttachments } from "../_components/review-attachments";
import { EMOTIONS, REVIEW_ERRORS, reflectionComplete } from "@/lib/tradesync/reflection";

export function Reviews() {
  const emptyFilters = { account_id: "", status: "", association: "", tag: "", q: "", emotion: "", primary_error: "" };
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountError, setAccountError] = useState("");
  const [data, setData] = useState<Page<ReviewListItem> | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [manageTags, setManageTags] = useState(false);
  const [checkedTrades, setCheckedTrades] = useState<number[]>([]);
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const analysisParams = new URLSearchParams();
  if (filters.account_id) analysisParams.set("account_id", filters.account_id);
  if (filters.tag) analysisParams.set("tag", filters.tag);
  if (filters.status) analysisParams.set("review_status", filters.status);
  async function applyBulk(action: "add" | "remove") {
    if (!checkedTrades.length || !bulkTag.trim()) return;
    setBulkBusy(true); setError("");
    try { await api.bulkReviewTags({ trade_ids: checkedTrades, tag: bulkTag.trim(), action }); setCheckedTrades([]); setBulkTag(""); setRevision(value => value + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "批量标签操作失败"); }
    finally { setBulkBusy(false); }
  }
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const tag = (query.get("tag") ?? "").slice(0, 40);
    const accountId = query.get("account_id") ?? "";
    if (!tag && !accountId) return;
    const next = { ...emptyFilters, tag, account_id: /^\d+$/.test(accountId) ? accountId : "" };
    setDraft(next); setFilters(next); setPage(1);
  }, []);
  useEffect(() => {
    if (!getToken()) return;
    let active = true;
    setAccountError("");
    api.accounts().catch(() => api.accounts()).then((result) => { if (active) { setAccounts(result); setAccountError(""); } })
      .catch((e: Error) => { if (active) setAccountError(e.message); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    if (!getToken()) { window.location.href = "/auth/v2/login"; return; }
    let active = true; setLoading(true); setError("");
    api.reviews(page, filters).then((result) => { if (active) setData(result); })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, revision, filters]);
  return <div className="flex flex-col gap-6">
    <div><h1 className="text-3xl tracking-tight">交易复盘</h1><p className="text-muted-foreground text-sm">汇总笔记、标签、情绪回顾、执行错误和下次行动。</p></div>
    <form onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }} className="flex flex-col gap-4">
      <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field><FieldLabel htmlFor="review-account">账户</FieldLabel><NativeSelect id="review-account" className="w-full" value={draft.account_id} onChange={(e) => setDraft({ ...draft, account_id: e.target.value })}>
          <NativeSelectOption value="">全部账户</NativeSelectOption>
          {accounts.map((account) => <NativeSelectOption key={account.id} value={String(account.id)}>{account.label ? `${account.label} · ${account.mt5_login}` : account.mt5_login}</NativeSelectOption>)}
        </NativeSelect></Field>
        <Field><FieldLabel htmlFor="review-status">复盘状态</FieldLabel><NativeSelect id="review-status" className="w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          <NativeSelectOption value="">全部状态</NativeSelectOption><NativeSelectOption value="draft">草稿</NativeSelectOption><NativeSelectOption value="reviewed">已复盘</NativeSelectOption>
        </NativeSelect></Field>
        <Field><FieldLabel htmlFor="review-association">交易关联</FieldLabel><NativeSelect id="review-association" className="w-full" value={draft.association} onChange={(e) => setDraft({ ...draft, association: e.target.value })}>
          <NativeSelectOption value="">全部记录</NativeSelectOption><NativeSelectOption value="linked">已关联交易</NativeSelectOption><NativeSelectOption value="orphan">待恢复关联</NativeSelectOption>
        </NativeSelect></Field>
        <Field><FieldLabel htmlFor="review-tag">标签（精确匹配）</FieldLabel><Input id="review-tag" maxLength={40} placeholder="如：追单" value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} /></Field>
        <Field><FieldLabel htmlFor="review-query">关键词</FieldLabel><Input id="review-query" maxLength={200} placeholder="笔记、结论、行动、情绪说明、品种或持仓编号" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></Field>
        <Field><FieldLabel htmlFor="review-emotion">情绪（任一阶段）</FieldLabel><NativeSelect id="review-emotion" value={draft.emotion} onChange={(e) => setDraft({ ...draft, emotion: e.target.value })}>
          <NativeSelectOption value="">全部情绪</NativeSelectOption>{Object.entries(EMOTIONS).map(([code, label]) => <NativeSelectOption key={code} value={code}>{label}</NativeSelectOption>)}
        </NativeSelect></Field>
        <Field><FieldLabel htmlFor="review-primary-error">主要错误</FieldLabel><NativeSelect id="review-primary-error" value={draft.primary_error} onChange={(e) => setDraft({ ...draft, primary_error: e.target.value })}>
          <NativeSelectOption value="">全部主要错误</NativeSelectOption>{Object.entries(REVIEW_ERRORS).map(([code, label]) => <NativeSelectOption key={code} value={code}>{label}</NativeSelectOption>)}
        </NativeSelect></Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-2"><Button type="submit">查询</Button><Button type="button" variant="outline" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); }}>清空筛选</Button><Button type="button" variant="outline" disabled={loading} onClick={() => setRevision((v) => v + 1)}>刷新</Button></div>
      <p className="text-muted-foreground text-xs">点击查询应用条件。结果仅包含已保存的笔记；草稿不代表尚未填写复盘的交易。</p>
    </form>
    {accountError && <Alert variant="destructive"><AlertTitle>账户选项加载失败</AlertTitle><AlertDescription>{accountError}。点击刷新重试，仍可按其他条件查询。</AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>复盘标签</CardTitle><CardDescription>点击标签立即查询，保留已应用的其他筛选条件。</CardDescription></CardHeader><CardContent>
      <ReviewTags key={filters.account_id} accountId={filters.account_id} revision={revision} selected={filters.tag ? [filters.tag] : []} onSelect={(tag) => {
        const next = { ...filters, tag }; setDraft(next); setFilters(next); setPage(1);
      }} />
      <Button className="mt-4" variant="outline" onClick={() => setManageTags(true)}>重命名／合并标签</Button>
      {filters.account_id ? <div className="mt-3 flex flex-col gap-2"><Button asChild variant="outline"><a href={`/dashboard/analytics?${analysisParams}`}>按当前账户、标签与复盘状态分析</a></Button><p className="text-muted-foreground text-xs">分析页默认使用该账户最近成交所在月份，仅统计完整平仓交易；关键词、关联状态、情绪和主要错误不带入，可在分析页调整日期。</p></div> : <p className="mt-3 text-muted-foreground text-xs">先选择一个账户并点击查询，即可查看对应标签的业绩分析。</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>批量应用标签</CardTitle><CardDescription>先在下方勾选已关联交易的复盘，再批量添加或移除一个标签；每份复盘都会保留新版本。</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field className="sm:max-w-sm"><FieldLabel htmlFor="bulk-review-tag">标签名称</FieldLabel><Input id="bulk-review-tag" maxLength={40} value={bulkTag} onChange={e => setBulkTag(e.target.value)} /></Field>
      <Button disabled={bulkBusy || !checkedTrades.length || !bulkTag.trim()} onClick={() => applyBulk("add")}>添加到 {checkedTrades.length} 份复盘</Button>
      <Button variant="outline" disabled={bulkBusy || !checkedTrades.length || !bulkTag.trim()} onClick={() => applyBulk("remove")}>从所选复盘移除</Button>
    </CardContent></Card>
    {loading && <Skeleton className="h-40 w-full" />}
    {error && <Alert variant="destructive"><AlertTitle>加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!loading && !error && data && <>
      {!data.items.length && <Empty><EmptyHeader><EmptyTitle>{Object.values(filters).some(Boolean) ? "没有符合条件的复盘" : "暂无复盘记录"}</EmptyTitle><EmptyDescription>{Object.values(filters).some(Boolean) ? "尝试调整关键词、标签或清空筛选条件。" : "打开“完整订单”，点击交易编号即可填写复盘。"}</EmptyDescription></EmptyHeader></Empty>}
      {data.items.map((r) => <Card key={r.id}><CardHeader><div className="flex items-start gap-3">{r.trade_id && <Checkbox aria-label={`选择交易 ${r.trade_id}`} checked={checkedTrades.includes(r.trade_id)} onCheckedChange={checked => setCheckedTrades(checked === true ? [...checkedTrades, r.trade_id!] : checkedTrades.filter(id => id !== r.trade_id))} />}<div><CardTitle>{r.symbol || "待恢复交易"} · 持仓 {r.position_id}</CardTitle>
        <CardDescription>账户 {r.account_login} · 更新于 {formatDateTime(r.updated_at)}</CardDescription></div></div></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2"><Badge>{r.status === "reviewed" ? "已复盘" : "草稿"}</Badge>
            {r.source_changed && <Badge variant="destructive">成交有变化，待核对</Badge>}
            {r.status === "reviewed" && !reflectionComplete(r.reflection) && <Badge variant="outline">结论／行动待补充</Badge>}
            {r.tags.map((tag) => <Badge variant="secondary" key={tag}>{tag}</Badge>)}</div>
          <div className="flex flex-wrap gap-2">{r.setup_name ? <><Badge>{r.setup_name} · v{r.playbook_version}</Badge><Badge variant="outline">覆盖率 {r.execution_coverage === null ? "不适用" : `${Math.round(r.execution_coverage * 100)}%`}</Badge><Badge variant={r.execution_compliance === "violations" ? "destructive" : "secondary"}>{r.evaluation_complete ? r.execution_compliance === "violations" ? "存在违规" : "评价完整" : "评价未完成"}</Badge>{r.execution_score !== null && <Badge variant="outline">执行分 {r.execution_score.toFixed(1)}</Badge>}{r.critical_failures.length > 0 && <Badge variant="destructive">关键违规 {r.critical_failures.length}</Badge>}</> : <Badge variant="outline">未关联模型</Badge>}</div>
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm">{r.notes || "未填写笔记"}</p>
          <p className="text-muted-foreground text-xs">入场前：{r.reflection.emotion_before ? EMOTIONS[r.reflection.emotion_before] : "未记录"} · 退出后：{r.reflection.emotion_after ? EMOTIONS[r.reflection.emotion_after] : "未记录"}（事后回忆）</p>
          <p className="text-sm">错误自评：{r.reflection.error_assessment === "none" ? "未发现错误" : r.reflection.error_assessment === "unassessed" ? "尚未评估" : r.reflection.errors.map((code) => REVIEW_ERRORS[code]).join("、")}；主要错误：{r.reflection.primary_error ? REVIEW_ERRORS[r.reflection.primary_error] : "未指定"}</p>
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm">结论：{r.reflection.conclusion || "未填写"}</p>
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm">下次行动：{r.reflection.no_new_action ? "继续执行现有规则，无需新增行动" : r.reflection.next_action || "未填写"}</p>
          <details><summary className="cursor-pointer text-sm">查看情绪说明、结论与行动全文</summary><div className="mt-2 flex max-h-80 flex-col gap-3 overflow-auto whitespace-pre-wrap break-words text-sm">
            <p>情绪说明：{r.reflection.emotion_notes || "未填写"}</p><p>复盘结论：{r.reflection.conclusion || "未填写"}</p>
            <p>下次行动：{r.reflection.no_new_action ? "继续执行现有规则，无需新增行动" : r.reflection.next_action || "未填写"}</p>
          </div></details>
          {r.trade_id ? <Button variant="outline" onClick={() => setSelected(r.trade_id)}>查看交易与编辑复盘</Button> : <>
            <Alert><AlertTitle>待恢复／范围外资料</AlertTitle><AlertDescription>当前没有完全匹配的交易，笔记与标签已保留。重新同步到相同持仓和开仓成交后会恢复关联；不会自动匹配到其他交易。</AlertDescription></Alert>
            <details><summary>查看保留的笔记全文</summary><p className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">{r.notes}</p></details>
            <ReviewAttachments reviewId={r.id} />
          </>}
        </CardContent></Card>)}
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage((v) => v - 1)}>上一页</Button>
        <span>{page} / {Math.max(1, Math.ceil(data.total / data.page_size))} · {data.total} 条</span>
        <Button variant="outline" disabled={page * data.page_size >= data.total} onClick={() => setPage((v) => v + 1)}>下一页</Button></div>
    </>}
    {selected !== null && <TradeDetailDrawer key={selected} tradeId={selected} onClose={() => { setSelected(null); setRevision((v) => v + 1); }} />}
    {manageTags && <TagManager accountId={filters.account_id} accountName={filters.account_id ? `账户 ${accounts.find((account) => String(account.id) === filters.account_id)?.mt5_login ?? filters.account_id}` : "我的全部账户"} initialTag={filters.tag}
      onClose={() => setManageTags(false)} onChanged={(source, target) => {
        const next = { ...filters, tag: filters.tag === source ? target : filters.tag };
        setFilters(next); setDraft(next); setPage(1); setRevision((value) => value + 1);
      }} />}
  </div>;
}
