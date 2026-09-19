"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getToken, performanceCsv, type Account, type PerformanceReport, type Setup, type SnapshotSeries } from "@/lib/tradesync/api";
import { TradeDetailDrawer } from "../orders/_components/trade-detail";

const amount = (value: number | null) => value === null ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

export function PerformanceWorkspace({ mode }: { mode: "analytics" | "calendar" }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [month, setMonth] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState("");
  const [tag, setTag] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [setups, setSetups] = useState<Setup[]>([]);
  const [setupId, setSetupId] = useState("");
  const [executionStatus, setExecutionStatus] = useState("");
  const [data, setData] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [day, setDay] = useState("");
  const [tradeId, setTradeId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotSeries | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setTag((query.get("tag") ?? "").slice(0, 40));
    const state = query.get("review_status") ?? "";
    setReviewStatus(["unwritten", "draft", "reviewed"].includes(state) ? state : "");
  }, []);

  useEffect(() => { api.setups().then(setSetups).catch(() => setSetups([])); }, [revision]);

  useEffect(() => {
    if (!getToken()) { window.location.href = "/auth/v2/login"; return; }
    let active = true;
    setLoading(true);
    setError("");
    api.accounts().then((items) => {
      if (!active) return;
      setAccounts(items);
      const requested = new URLSearchParams(window.location.search).get("account_id");
      const initialAccount = items.find((account) => String(account.id) === requested) ?? items[0];
      setAccountId((previous) => previous || String(initialAccount?.id ?? ""));
      const latest = initialAccount?.latest_deal_time;
      const date = new Date(latest ? latest * 1000 : Date.now()).toISOString().slice(0, 10);
      setMonth((v) => v || date.slice(0, 7));
      setStart((v) => v || `${date.slice(0, 7)}-01`);
      setEnd((v) => v || date);
      if (!items.length) setLoading(false);
    }).catch((e: Error) => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    if (!accountId) return;
    if (!month || !start || !end) {
      setData(null); setLoading(false); setError("请填写完整的日期范围。"); return;
    }
    let active = true;
    setData(null);
    setDay("");
    setError("");
    const [year, m] = month.split("-").map(Number);
    if (!year || year < 1970 || year > 9998 || !m || start > end) {
      setError("请选择有效的日期范围（开始日期不能晚于结束日期）。"); setLoading(false); return;
    }
    setLoading(true);
    const params = new URLSearchParams({ account_id: accountId,
      start_date: mode === "calendar" ? `${month}-01` : start,
      end_date: mode === "calendar" ? new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10) : end });
    if (symbol.trim()) params.set("symbol", symbol.trim());
    if (direction) params.set("direction", direction);
    if (tag.trim()) params.set("tag", tag.trim());
    if (reviewStatus) params.set("review_status", reviewStatus);
    if (setupId) params.set("setup_id", setupId);
    if (executionStatus) params.set("execution_status", executionStatus);
    const timer = window.setTimeout(() => {
      api.performance(params).then((result) => { if (active) setData(result); })
        .catch((e: Error) => { if (active) setError(e.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accountId, month, start, end, symbol, direction, tag, reviewStatus, setupId, executionStatus, revision, mode]);

  useEffect(() => {
    if (!accountId) {
      setSnapshots(null);
      return;
    }
    let rangeStart = "";
    let rangeEnd = "";
    if (mode === "calendar") {
      if (!/^\d{4}-\d{2}$/.test(month)) return;
      rangeStart = `${month}-01`;
      const [rangeYear, rangeMonth] = month.split("-").map(Number);
      const lastDay = new Date(Date.UTC(rangeYear, rangeMonth, 0)).getUTCDate();
      rangeEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
    } else {
      if (!start || !end || start > end) return;
      rangeStart = start;
      rangeEnd = end;
    }
    const startParts = rangeStart.split("-").map(Number);
    const endParts = rangeEnd.split("-").map(Number);
    if (startParts.some(Number.isNaN) || endParts.some(Number.isNaN)) return;
    const startTime = Math.floor(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]) / 1000);
    const endTime = Math.floor(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] + 1) / 1000);
    let active = true;
    setSnapshots(null);
    const timer = window.setTimeout(() => {
      api.accountSnapshots(Number(accountId), { start_time: startTime, end_time: endTime, limit: 1000 })
        .then((result) => { if (active) setSnapshots(result); })
        .catch(() => { if (active) setSnapshots(null); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accountId, mode, month, start, end]);
  const snapshotPoints = snapshots?.items ?? [];
  const selectedDay = data?.days.find((item) => item.date === day);
  const [year, monthNumber] = month.split("-").map(Number);
  const count = year && monthNumber ? new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() : 0;
  const offset = year && monthNumber ? (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7 : 0;
  async function exportCsv() {
    if (!accountId || !start || !end) return;
    setExporting(true); setError("");
    try {
      const params = new URLSearchParams({ account_id: accountId, start_date: start, end_date: end });
      if (symbol.trim()) params.set("symbol", symbol.trim()); if (direction) params.set("direction", direction);
      if (tag.trim()) params.set("tag", tag.trim()); if (reviewStatus) params.set("review_status", reviewStatus);
      if (setupId) params.set("setup_id", setupId); if (executionStatus) params.set("execution_status", executionStatus);
      const blob = await performanceCsv(params); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `TradeEZ-交易分析-${start}-${end}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : "导出失败"); }
    finally { setExporting(false); }
  }

  return <div className="flex flex-col gap-6">
    <div><h1 className="text-3xl tracking-tight">{mode === "analytics" ? "交易分析" : "交易日历"}</h1>
      <p className="text-muted-foreground text-sm">按平仓日期统计完整交易，净收益包含佣金与隔夜费。</p></div>
    <Card><CardHeader><CardTitle>统计范围</CardTitle>
      <CardDescription>按 EA 上传的 UTC 平仓日期统计，不转换为浏览器时区。首次展示最近成交所在月份。</CardDescription>
    </CardHeader><CardContent>
      <FieldGroup className="sm:flex-row sm:flex-wrap">
        <Field className="sm:w-auto"><FieldLabel htmlFor="performance-account">账户</FieldLabel>
          <NativeSelect id="performance-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {!accounts.length && <NativeSelectOption value="">暂无账户</NativeSelectOption>}
            {accounts.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.label || String(a.mt5_login)}</NativeSelectOption>)}
          </NativeSelect></Field>
        {mode === "calendar" ? <Field className="sm:w-auto"><FieldLabel htmlFor="performance-month">月份</FieldLabel>
          <Input id="performance-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field> : <>
          <Field className="sm:w-auto"><FieldLabel htmlFor="performance-start">开始日期</FieldLabel>
            <Input id="performance-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field className="sm:w-auto"><FieldLabel htmlFor="performance-end">结束日期</FieldLabel>
            <Input id="performance-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></>}
        <Field className="sm:w-auto"><FieldLabel htmlFor="performance-symbol">品种</FieldLabel>
          <Input id="performance-symbol" placeholder="全部品种" value={symbol} onChange={(e) => setSymbol(e.target.value)} /></Field>
        <Field className="sm:w-auto"><FieldLabel htmlFor="performance-direction">方向</FieldLabel>
          <NativeSelect id="performance-direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <NativeSelectOption value="">全部方向</NativeSelectOption><NativeSelectOption value="buy">做多</NativeSelectOption>
            <NativeSelectOption value="sell">做空</NativeSelectOption></NativeSelect></Field>
        <Field className="sm:w-auto"><FieldLabel htmlFor="performance-tag">复盘标签（精确匹配）</FieldLabel>
          <Input id="performance-tag" maxLength={40} placeholder="全部标签" value={tag} onChange={(e) => setTag(e.target.value)} /></Field>
        <Field className="sm:w-auto"><FieldLabel htmlFor="performance-review">复盘状态</FieldLabel>
          <NativeSelect id="performance-review" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
            <NativeSelectOption value="">全部复盘状态</NativeSelectOption><NativeSelectOption value="unwritten">未填写</NativeSelectOption><NativeSelectOption value="draft">草稿</NativeSelectOption><NativeSelectOption value="reviewed">已复盘</NativeSelectOption>
          </NativeSelect></Field>
        <Field className="sm:w-auto"><FieldLabel htmlFor="performance-setup">交易模型</FieldLabel><NativeSelect id="performance-setup" value={setupId} onChange={(e) => setSetupId(e.target.value)}><NativeSelectOption value="">全部模型</NativeSelectOption>{setups.map((setup) => <NativeSelectOption key={setup.id} value={setup.id}>{setup.name}{setup.status === "disabled" ? "（已停用）" : ""}</NativeSelectOption>)}</NativeSelect></Field>
        <Field className="sm:w-auto"><FieldLabel htmlFor="performance-execution">执行评价</FieldLabel><NativeSelect id="performance-execution" value={executionStatus} onChange={(e) => setExecutionStatus(e.target.value)}><NativeSelectOption value="">全部评价</NativeSelectOption><NativeSelectOption value="unrated">未评价</NativeSelectOption><NativeSelectOption value="compliant">全部遵守</NativeSelectOption><NativeSelectOption value="violations">存在违规</NativeSelectOption><NativeSelectOption value="insufficient">证据不足</NativeSelectOption></NativeSelect></Field>
      </FieldGroup>
      <p className="mt-3 text-muted-foreground text-xs">标签与状态按当前已保存复盘筛选；没有匹配交易的待恢复笔记不计入业绩。修改标签或复盘状态会改变历史筛选结果，已复盘不代表成交修正后已重新核对。</p>
      <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setTag(""); setReviewStatus(""); setSetupId(""); setExecutionStatus(""); }}>清空复盘筛选</Button><Button variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}>刷新统计</Button>{mode === "analytics" && <Button variant="outline" disabled={loading || exporting || !data} onClick={exportCsv}>{exporting ? "正在导出…" : "导出当前结果 CSV"}</Button>}</div>
    </CardContent></Card>
    {error && <Alert variant="destructive"><AlertTitle>无法加载统计</AlertTitle><AlertDescription>{error}
      <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>重试</Button></AlertDescription></Alert>}
    {loading && <Skeleton className="h-48 w-full" />}
    {!loading && !error && !accounts.length && <Empty><EmptyHeader><EmptyTitle>请先绑定账户</EmptyTitle>
      <EmptyDescription>在“账号与 EA”页面绑定账户并同步成交。</EmptyDescription></EmptyHeader></Empty>}
    {!loading && !error && data?.resync_pending && <Alert><AlertTitle>账户正在重新同步</AlertTitle><AlertDescription>请在 EA 更新新密钥并完成一轮同步。当前数据尚不完整，暂不展示业绩统计。</AlertDescription></Alert>}
    {!loading && !error && data && !data.resync_pending && <>
      <p className="text-muted-foreground text-sm">金额单位：{data.currency || "账户原币（币种未设置）"} · 当前品种、方向与复盘筛选下，全历史未纳入统计：
        {data.excluded.partial} 笔未平仓、{data.excluded.needs_review} 笔待核对。</p>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[["净收益", amount(data.summary.net_pnl)], ["完整交易", String(data.summary.count)],
          ["胜率", data.summary.win_rate === null ? "—" : `${amount(data.summary.win_rate)}%`],
          ["最大已实现回撤", amount(data.summary.max_drawdown)], ["利润因子", amount(data.summary.profit_factor)],
          ["平均盈利 / 平均亏损", amount(data.summary.payoff_ratio)], ["每笔平均收益", amount(data.summary.average_pnl)],
          ["盈 / 亏 / 持平", `${data.summary.wins} / ${data.summary.losses} / ${data.summary.breakeven}`]].map(([label, value]) =>
          <Card key={label}><CardHeader><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>)}
      </div>
      <p className="text-muted-foreground text-xs">利润因子 = 盈利总额 / 亏损绝对总额，无亏损时显示“—”。回撤按期间内逐笔平仓累计净收益计算，不含浮动盈亏与入出金。</p>
      {mode === "analytics" ? <>
        <Card><CardHeader><CardTitle>累计已实现净收益</CardTitle><CardDescription>期间起点为零；曲线显示有平仓交易的日期。</CardDescription></CardHeader>
          <CardContent>{data.days.length ? <ChartContainer config={{ cumulative_pnl: { label: "累计净收益", color: "var(--chart-1)" } }} className="h-72 w-full">
            <LineChart accessibilityLayer data={[{ date: "期初", cumulative_pnl: 0 }, ...data.days]}>
              <CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} /><YAxis width={70} />
              <ChartTooltip content={<ChartTooltipContent />} /><Line type="linear" dataKey="cumulative_pnl" stroke="var(--color-cumulative_pnl)" dot={false} />
            </LineChart></ChartContainer> : <Empty><EmptyHeader><EmptyTitle>该期间没有完整平仓交易</EmptyTitle>
              <EmptyDescription>可扩大日期范围，或检查同步与待核对交易。</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card>
        <Card><CardHeader><CardTitle>账户余额与净值快照</CardTitle>
          <CardDescription>EA 心跳上报的实时资金序列；余额只反映已结算结果，净值包含浮动盈亏。图表取所选范围内最近 1000 个快照点，时间按 UTC 展示。</CardDescription></CardHeader>
          <CardContent>{snapshotPoints.length ? <ChartContainer config={{ balance: { label: "余额", color: "var(--chart-2)" }, equity: { label: "净值", color: "var(--chart-1)" } }} className="h-72 w-full">
            <LineChart accessibilityLayer data={snapshotPoints.map((point) => ({ label: `${new Date(point.timestamp * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`, balance: point.balance, equity: point.equity }))}>
              <CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} minTickGap={32} /><YAxis width={70} />
              <ChartLegend content={<ChartLegendContent />} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="linear" dataKey="equity" stroke="var(--color-equity)" dot={false} />
              <Line type="linear" dataKey="balance" stroke="var(--color-balance)" dot={false} />
            </LineChart></ChartContainer> : <Empty><EmptyHeader><EmptyTitle>所选时间暂无资金快照</EmptyTitle>
              <EmptyDescription>EA 连接并上报心跳后才会生成快照；没有快照不影响已平仓成交统计。</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card>
        <Card><CardHeader><CardTitle>按品种统计</CardTitle><CardDescription>与上方筛选及统计口径一致。</CardDescription></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>品种</TableHead><TableHead>交易数</TableHead><TableHead>净收益</TableHead><TableHead>胜率</TableHead></TableRow></TableHeader>
            <TableBody>{data.symbols.map((s) => <TableRow key={s.symbol}><TableCell>{s.symbol}</TableCell><TableCell>{s.count}</TableCell>
              <TableCell>{amount(s.net_pnl)}</TableCell><TableCell>{amount(s.win_rate)}%</TableCell></TableRow>)}</TableBody></Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>按交易模型统计</CardTitle><CardDescription>未关联模型单独列出；执行分只统计证据覆盖率完整的交易。</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>模型</TableHead><TableHead>交易数</TableHead><TableHead>净收益</TableHead><TableHead>胜率</TableHead><TableHead>已评分</TableHead><TableHead>平均执行分</TableHead></TableRow></TableHeader><TableBody>{data.setups.map((setup) => <TableRow key={setup.setup}><TableCell>{setup.setup}</TableCell><TableCell>{setup.count}</TableCell><TableCell>{amount(setup.net_pnl)}</TableCell><TableCell>{setup.win_rate === null ? "—" : `${amount(setup.win_rate)}%`}</TableCell><TableCell>{setup.scored}</TableCell><TableCell>{amount(setup.average_score)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <BreakdownTable title="按入场时段统计" description="按首次入场 UTC 小时划分：亚洲 00–07、伦敦 08–12、纽约 13–21，其余为其他时段。" items={data.sessions} onOpen={setTradeId} />
        <BreakdownTable title="按复盘标签统计" description="一笔交易可出现在多个标签中，标签组之间不能直接相加。" items={data.tags} onOpen={setTradeId} />
        <BreakdownTable title="按主要错误统计" description="使用复盘中选择的主要错误；未完成错误评估的交易单独列出。" items={data.errors} onOpen={setTradeId} />
        <BreakdownTable title="按规则执行结论统计" description="区分全部遵守、存在违规、证据不足和未评价。" items={data.executions} onOpen={setTradeId} />
      </> : <Card><CardHeader><CardTitle>{month} · 每日交易</CardTitle><CardDescription>点击有交易的日期查看交易明细；金额为净收益。</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto"><div className="grid min-w-140 grid-cols-7 gap-2">
          {["一", "二", "三", "四", "五", "六", "日"].map((w) => <span key={w} className="text-center text-muted-foreground">{w}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: count }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            const stats = data.days.find((d) => d.date === date);
            return <Button key={date} variant={day === date ? "default" : "outline"} className="h-24 flex-col gap-1 px-1"
              disabled={!stats} aria-label={`${date}，${stats?.count ?? 0} 笔交易，净收益 ${amount(stats?.net_pnl ?? 0)}`}
              aria-pressed={day === date} onClick={() => setDay(date)}>
              <span>{i + 1}</span><span>{stats ? amount(stats.net_pnl) : "—"}</span><span>{stats ? `${stats.count} 笔` : ""}</span>
            </Button>;
          })}
        </div></CardContent></Card>}
      {mode === "calendar" && selectedDay && <Card><CardHeader><CardTitle>{day} · {selectedDay.count} 笔交易</CardTitle>
        <CardDescription>净收益 {amount(selectedDay.net_pnl)} · 点击编号查看成交与费用来源。</CardDescription></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>交易</TableHead><TableHead>品种</TableHead><TableHead>方向</TableHead><TableHead>净收益</TableHead></TableRow></TableHeader>
            <TableBody>{selectedDay.trades.map((t) => <TableRow key={t.trade_id}><TableCell><Button variant="link" onClick={() => setTradeId(t.trade_id)}>#{t.trade_id}</Button></TableCell>
              <TableCell>{t.symbol}</TableCell><TableCell>{t.direction === "buy" ? "做多" : "做空"}</TableCell><TableCell>{amount(t.net_pnl)}</TableCell></TableRow>)}</TableBody></Table>
        </CardContent></Card>}
    </>}
    {tradeId !== null && <TradeDetailDrawer key={tradeId} tradeId={tradeId} onReviewSaved={() => setRevision((value) => value + 1)} onClose={() => { setTradeId(null); setRevision((value) => value + 1); }} />}
  </div>;
}

function BreakdownTable({ title, description, items, onOpen }: { title: string; description: string; items: (PerformanceReport["sessions"][number])[]; onOpen: (id: number) => void }) {
  const [expanded, setExpanded] = useState("");
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>
    {!items.length ? <p className="text-muted-foreground text-sm">当前筛选范围暂无可分组数据。</p> : <Table><TableHeader><TableRow><TableHead>分组</TableHead><TableHead>交易数</TableHead><TableHead>净收益</TableHead><TableHead>胜率</TableHead><TableHead>平均收益</TableHead><TableHead>下钻</TableHead></TableRow></TableHeader><TableBody>
      {items.map(item => <TableRow key={item.name}><TableCell>{item.name}</TableCell><TableCell>{item.count}</TableCell><TableCell>{amount(item.net_pnl)}</TableCell><TableCell>{item.win_rate === null ? "—" : `${amount(item.win_rate)}%`}</TableCell><TableCell>{amount(item.average_pnl)}</TableCell><TableCell>{item.trade_ids[0] ? <div className="flex flex-col items-start"><Button variant="link" onClick={() => setExpanded(expanded === item.name ? "" : item.name)}>{expanded === item.name ? "收起交易" : `展开 ${item.trade_ids.length} 笔`}</Button>{expanded === item.name && <div className="flex max-w-sm flex-wrap gap-1">{item.trade_ids.slice(0, 30).map(id => <Button key={id} size="sm" variant="outline" onClick={() => onOpen(id)}>#{id}</Button>)}{item.trade_ids.length > 30 && <span className="text-muted-foreground text-xs">另有 {item.trade_ids.length - 30} 笔，可缩小筛选范围后查看</span>}</div>}</div> : "—"}</TableCell></TableRow>)}
    </TableBody></Table>}
  </CardContent></Card>;
}


