"use client";

import { useState } from "react";

import { Bot, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/i18n";
import { type AiCenterText, aiCenterText } from "@/lib/tradesync/ai-center-i18n";

interface Capability {
  key: keyof AiCenterText;
  descKey: keyof AiCenterText;
  lastUsed: string | null;
  enabled: boolean;
  available?: boolean;
}

const CAPABILITIES: Capability[] = [
  { key: "capTrades", descKey: "capTradesDesc", lastUsed: "2026-09-21 09:12", enabled: true },
  { key: "capAccounts", descKey: "capAccountsDesc", lastUsed: "2026-09-20 22:40", enabled: true },
  { key: "capStrategies", descKey: "capStrategiesDesc", lastUsed: null, enabled: true },
  { key: "capNotes", descKey: "capNotesDesc", lastUsed: null, enabled: false },
  { key: "capMemory", descKey: "capMemoryDesc", lastUsed: "2026-09-21 09:12", enabled: true },
  { key: "capResources", descKey: "capResourcesDesc", lastUsed: null, enabled: false, available: false },
  { key: "capScore", descKey: "capScoreDesc", lastUsed: null, enabled: true },
];

const BILLS = [
  {
    time: "2026-09-21 09:12",
    feature: "featureChat",
    model: "标准档 · qwen-plus",
    usage: "1,842 / 964",
    credits: 4,
    ok: true,
  },
  {
    time: "2026-09-20 22:40",
    feature: "featureDaily",
    model: "标准档 · qwen-plus",
    usage: "6,318 / 2,155",
    credits: 8,
    ok: true,
  },
  {
    time: "2026-09-20 22:39",
    feature: "featureTradeNote",
    model: "快速档 · qwen-turbo",
    usage: "812 / 431",
    credits: 1,
    ok: true,
  },
  { time: "2026-09-20 18:05", feature: "featureChat", model: "深度档 · qwen-max", usage: "—", credits: 0, ok: false },
];

const MEMORIES = [
  { label: "交易风格", value: "日内剥头皮，偏好黄金与美指" },
  { label: "风险规则", value: "单笔风险不超过账户 1%，连续亏损 2 笔后暂停" },
  { label: "关注指标", value: "期望值、盈亏比、回撤与日内胜率" },
];

const AUTOMATIONS = [
  { key: "autoDaily", descKey: "autoDailyDesc", schedule: "22:30", cap: 20, notify: "notifyInApp", enabled: true },
  { key: "autoAnomaly", descKey: "autoAnomalyDesc", schedule: "实时", cap: 10, notify: "notifyBoth", enabled: true },
  { key: "autoStreak", descKey: "autoStreakDesc", schedule: "实时", cap: 10, notify: "notifyBoth", enabled: false },
  { key: "autoTodo", descKey: "autoTodoDesc", schedule: "09:00", cap: 5, notify: "notifyInApp", enabled: false },
] as const;

export default function AiSettingsPage() {
  const locale = useLocale();
  const t = aiCenterText[locale];
  const [tier, setTier] = useState<"fast" | "standard" | "deep">("standard");
  const [smartRouting, setSmartRouting] = useState(true);
  const [autoMemory, setAutoMemory] = useState(true);
  const [userPrompt, setUserPrompt] = useState(t.promptUserPlaceholder);
  const [capabilityState, setCapabilityState] = useState<Record<string, boolean>>(
    Object.fromEntries(CAPABILITIES.map((item) => [String(item.key), item.enabled])),
  );
  const [automationState, setAutomationState] = useState<Record<string, boolean>>(
    Object.fromEntries(AUTOMATIONS.map((item) => [String(item.key), item.enabled])),
  );

  const tierOptions: { key: "fast" | "standard" | "deep"; label: keyof AiCenterText }[] = [
    { key: "fast", label: "tierFast" },
    { key: "standard", label: "tierStandard" },
    { key: "deep", label: "tierDeep" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-3xl tracking-tight">
            <Bot className="size-7 text-primary" />
            {t.title}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 border-primary/25 bg-primary/10 text-primary">
            <Sparkles className="size-3" />
            {t.balance} 186 {t.creditsUnit}
          </Badge>
          <Button variant="outline" disabled title={t.rechargePending}>
            {t.recharge}
          </Button>
        </div>
      </header>

      <section className="grid gap-3 xl:grid-cols-4">
        <MetricTile label={t.balanceGift} value="100" unit={t.creditsUnit} />
        <MetricTile label={t.balancePurchased} value="140" unit={t.creditsUnit} />
        <MetricTile label={t.balanceConsumed} value="54" unit={t.creditsUnit} tone="loss" />
        <MetricTile label={t.todaySpend} value="4" unit={t.creditsUnit} hint={`${t.monthSpend} 54`} />
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="gap-0 pt-4 pb-4">
          <CardHeader className="py-0">
            <CardTitle className="text-base">{t.sectionModel}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-sm">
                {t.tier}
                <span className="ml-2 text-xs">{t.tierTip}</span>
              </span>
              <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-[#eeedf8] p-1">
                {tierOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setTier(option.key)}
                    className={`rounded-md px-4 py-1.5 font-semibold text-sm transition-colors ${
                      tier === option.key ? "bg-[#dfdaf0] text-foreground" : "text-[#7d7a8c] hover:text-foreground"
                    }`}
                  >
                    {t[option.label]}
                  </button>
                ))}
              </div>
            </div>

            <SwitchRow
              title={t.smartRouting}
              hint={t.smartRoutingHint}
              checked={smartRouting}
              onChange={setSmartRouting}
            />

            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="font-medium">{t.defaultContext}</span>
              <span className="text-muted-foreground">{t.contextAccounts}：2/2（主账户、UpWay）</span>
              <span className="text-muted-foreground">
                {t.contextRange}：{t.contextAll}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 pt-4 pb-4">
          <CardHeader className="py-0">
            <CardTitle className="text-base">{t.sectionCredits}</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-bold">{t.billTime}</TableHead>
                  <TableHead className="font-bold">{t.billFeature}</TableHead>
                  <TableHead className="font-bold">{t.billModel}</TableHead>
                  <TableHead className="text-right font-bold">{t.billUsage}</TableHead>
                  <TableHead className="text-right font-bold">{t.billCredits}</TableHead>
                  <TableHead className="text-right font-bold">{t.billStatus}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BILLS.map((bill) => (
                  <TableRow key={bill.time + bill.feature} className="border-b border-[#e8e5f0]">
                    <TableCell className="text-muted-foreground">{bill.time}</TableCell>
                    <TableCell>{t[bill.feature as keyof AiCenterText]}</TableCell>
                    <TableCell className="text-muted-foreground">{bill.model}</TableCell>
                    <TableCell className="text-right tabular-nums">{bill.usage}</TableCell>
                    <TableCell className="text-right tabular-nums">{bill.credits}</TableCell>
                    <TableCell className={`text-right ${bill.ok ? "text-profit" : "text-loss"}`}>
                      {bill.ok ? t.billSuccess : t.billFailed}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 pt-4 pb-4">
        <CardHeader className="py-0">
          <CardTitle className="text-base">{t.sectionCapabilities}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          <p className="text-muted-foreground text-sm">{t.capabilitiesHint}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {CAPABILITIES.map((capability) => {
              const key = String(capability.key);
              const enabled = capabilityState[key];
              return (
                <div
                  key={key}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                    capability.available === false ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">{t[capability.key]}</span>
                    <span className="text-muted-foreground text-xs">{t[capability.descKey]}</span>
                    <span className="text-[11px] text-muted-foreground">{capabilityUsageText(t, capability)}</span>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={capability.available === false}
                    onCheckedChange={(next) => setCapabilityState((prev) => ({ ...prev, [key]: next }))}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="gap-0 pt-4 pb-4">
          <CardHeader className="py-0">
            <CardTitle className="text-base">{t.sectionPrompts}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
              <span className="font-medium text-sm">{t.promptSystem}</span>
              <span className="text-muted-foreground text-xs">{t.promptSystemHint}</span>
              <p className="text-sm">
                你是 TradeEZ 的交易复盘助手，语气克制、先给结论再给依据，不预测行情，不给出买卖建议。
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
              <span className="font-medium text-sm">{t.promptModule}</span>
              <span className="text-muted-foreground text-xs">{t.promptModuleHint}</span>
              <ul className="flex flex-col gap-1 text-sm">
                <li>日复盘：输出当日表现、执行偏离、典型错误与明日改进</li>
                <li>单笔复盘：抽取交易事实、计划与实际差异、可复用结论</li>
                <li>报告摘要：按品种/时段/策略给出结构化结论与建议</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-medium text-sm">{t.promptUser}</span>
              <Textarea value={userPrompt} onChange={(event) => setUserPrompt(event.target.value)} rows={3} />
              <div className="flex items-center gap-2">
                <Button size="sm">{t.save}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 pt-4 pb-4">
          <CardHeader className="py-0">
            <CardTitle className="text-base">{t.memories}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <SwitchRow title={t.memoryAuto} hint={t.memoryAutoHint} checked={autoMemory} onChange={setAutoMemory} />
            <div className="flex flex-col gap-2">
              {MEMORIES.map((memory) => (
                <div key={memory.label} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">{memory.label}</span>
                    <span className="text-muted-foreground text-xs">{memory.value}</span>
                  </div>
                  <span className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      {t.memoryEdit}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-loss">
                      {t.memoryDelete}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-fit">
              {t.memoryReset}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 pt-4 pb-4">
        <CardHeader className="flex flex-row items-center justify-between py-0">
          <CardTitle className="text-base">{t.sectionAutomation}</CardTitle>
          <Badge variant="outline" className="text-muted-foreground">
            {t.phase2}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          <p className="text-muted-foreground text-sm">{t.automationHint}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {AUTOMATIONS.map((automation) => {
              const key = String(automation.key);
              return (
                <div key={key} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm">{t[automation.key]}</span>
                      <span className="text-muted-foreground text-xs">{t[automation.descKey]}</span>
                    </div>
                    <Switch
                      checked={automationState[key]}
                      onCheckedChange={(next) => setAutomationState((prev) => ({ ...prev, [key]: next }))}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                    <span>
                      {t.schedule}：{automation.schedule}
                    </span>
                    <span>
                      {t.creditCap}：{automation.cap} {t.creditsUnit}
                    </span>
                    <span>
                      {t.notify}：{t[automation.notify as keyof AiCenterText]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 pt-4 pb-4">
        <CardHeader className="py-0">
          <CardTitle className="text-base">{t.sectionPrivacy}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          <InfoRow label={t.privacyScope} value={t.privacyScopeValue} />
          <InfoRow label={t.privacyRetention} value={t.privacyRetentionValue} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm">
              {t.clearContext}
            </Button>
            <span className="text-muted-foreground text-xs">{t.clearContextHint}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="border-loss/40 text-loss hover:bg-loss/10">
              {t.deleteAll}
            </Button>
            <span className="text-muted-foreground text-xs">{t.deleteAllHint}</span>
          </div>
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-muted-foreground text-xs">{t.disclaimer}</p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Last-used label for a capability row, without nesting ternaries inline. */
function capabilityUsageText(t: AiCenterText, capability: Capability): string {
  if (capability.available === false) return t.notConnected;
  if (capability.lastUsed) return `${t.lastUsed}：${capability.lastUsed}`;
  return t.neverUsed;
}

function MetricTile({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  hint?: string;
  tone?: "loss";
}) {
  return (
    <Card className="gap-1 pt-4 pb-4">
      <CardHeader className="py-0">
        <CardTitle className="font-semibold text-muted-foreground text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5">
        <span className={`font-semibold text-2xl tabular-nums ${tone === "loss" ? "text-loss" : ""}`}>
          {value}
          <span className="ml-1 font-normal text-muted-foreground text-sm">{unit}</span>
        </span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-sm">{title}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
