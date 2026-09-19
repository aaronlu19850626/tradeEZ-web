"use client";

import { Check, Copy, Link2, RefreshCw, ServerCog } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  api,
  EA_API_BASE_URL,
  type Account,
  type AccountWithKey,
  type AccountMaintenanceAudit,
  type EaSettingsSnapshot,
  formatDateTime,
  formatUnix,
  getEaServerOrigin,
  getToken,
} from "@/lib/tradesync/api";
import { EaConnection } from "./_components/ea-connection";
import { EaSettingsView } from "./_components/ea-settings-view";
import { AccountEditor } from "./_components/account-editor";
import { AccountMaintenance } from "./_components/account-maintenance";
import { AccountSymbolSpecs } from "./_components/account-symbol-specs";

const emptyForm = {
  label: "",
  notes: "",
  mt5_login: "",
  broker_server: "",
  account_currency: "",
  server_timezone_name: "",
  sync_start_date: "",
};

function formatUtc(value?: number | null) {
  return value ? `${new Date(value * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC` : "—";
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [created, setCreated] = useState<AccountWithKey | null>(null);
  const [eaAccount, setEaAccount] = useState<Account | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [maintenance, setMaintenance] = useState<{ account: Account; action: "reset" | "delete" } | null>(null);
  const [maintenanceAudits, setMaintenanceAudits] = useState<AccountMaintenanceAudit[]>([]);

  async function load() {
    setLoading(true);
    setPageError(null);
    try {
      setAccounts(await api.accounts().catch(() => api.accounts()));
      try { setMaintenanceAudits(await api.maintenanceAudits().catch(() => api.maintenanceAudits())); } catch { setMaintenanceAudits([]); }
      window.dispatchEvent(new Event("tradesync-accounts-changed"));
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "账号加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/auth/v2/login";
      return;
    }
    load();
  }, []);

  async function createAccount() {
    const login = form.mt5_login.trim();
    if (!/^[1-9]\d{0,18}$/.test(login) || BigInt(login) > BigInt("9223372036854775807")) {
      setFormError("请输入正确的 MT5 登录号。");
      return;
    }
    if (!form.broker_server.trim()) {
      setFormError("请填写券商服务器作为账户说明；当前 EA 协议按 MT5 登录号识别账户。");
      return;
    }

    const syncStartTime = Date.parse(`${form.sync_start_date}T00:00:00Z`) / 1000;
    if (!form.sync_start_date || !Number.isFinite(syncStartTime) || syncStartTime < 0 || syncStartTime > Date.now() / 1000) {
      setFormError("请选择同步开始日期，不能晚于今天 UTC。"); return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const result = await api.createAccount({
        mt5_login: login,
        label: form.label.trim() || null,
        notes: form.notes.trim() || null,
        broker_server: form.broker_server.trim(),
        account_currency: form.account_currency.trim().toUpperCase() || null,
        server_timezone_name: form.server_timezone_name.trim() || null,
        sync_start_time: syncStartTime,
      });
      setCreated(result);
      setForm(emptyForm);
      setBindOpen(false);
      await load();
      toast.success("MT5 账号已绑定，请复制密钥并写入 EA。");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "绑定失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(account: Account) {
    const nextStatus = account.status === "active" ? "disabled" : "active";
    const confirmed = nextStatus === "active" || window.confirm(`确定停用 ${account.label || account.mt5_login} 吗？停用后 EA 将无法继续同步。`);
    if (!confirmed) return;
    try {
      const updated = await api.updateAccount(account.id, { status: nextStatus, expected_revision: account.config_revision });
      window.dispatchEvent(new Event("tradesync-accounts-changed"));
      setAccounts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setEaAccount((current) => (current?.id === updated.id ? updated : current));
      toast.success(nextStatus === "active" ? "账号已恢复同步" : "账号已停用同步，MT5 中的交易行为不受影响");
    } catch (err) {
      toast.error("状态更新失败", { description: err instanceof Error ? err.message : "请稍后重试" });
    }
  }

  function handleKeyRotated(account: AccountWithKey) {
    const { sync_key: _key, message: _message, ...updatedAccount } = account;
    setAccounts((items) => items.map((item) => (item.id === account.id ? updatedAccount : item)));
    setEaAccount((current) => current?.id === account.id ? updatedAccount : current);
  }

  const activeCount = accounts.filter((account) => account.status === "active").length;
  const orderCount = accounts.reduce((sum, account) => sum + account.synced_order_count, 0);
  const dealCount = accounts.reduce((sum, account) => sum + account.deal_count, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl tracking-tight">账号与 EA</h1>
          <p className="text-muted-foreground text-sm">绑定只做一次；日常主要查看连接、数量、游标和同步配置。</p>
        </div>
        <Drawer open={bindOpen} onOpenChange={(open) => { if (!saving) setBindOpen(open); }} direction="right">
          <DrawerTrigger asChild>
            <Button disabled={saving}>
              <Link2 className="size-4" />
              绑定 MT5 账号
            </Button>
          </DrawerTrigger>
          <DrawerContent className="rounded-none sm:max-w-2xl">
            <DrawerHeader>
              <DrawerTitle>绑定 MT5 账号</DrawerTitle>
              <DrawerDescription>填写 MT5 登录号和券商服务器后生成仅本次完整显示的同步密钥。当前协议按登录号识别账户，券商服务器是人工备注。</DrawerDescription>
            </DrawerHeader>
            <ScrollArea className="px-4 pb-6">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel>显示名称（可选）</FieldLabel>
                  <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="例如：黄金模拟盘" />
                </Field>
                <Field>
                  <FieldLabel>MT5 登录号</FieldLabel>
                  <Input value={form.mt5_login} onChange={(event) => setForm({ ...form, mt5_login: event.target.value })} inputMode="numeric" placeholder="88973405" />
                </Field>
                <Field>
                  <FieldLabel>券商服务器</FieldLabel>
                  <Input value={form.broker_server} onChange={(event) => setForm({ ...form, broker_server: event.target.value })} placeholder="例如 ICMarketsSC-Demo" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>账号币种</FieldLabel>
                    <Input value={form.account_currency} onChange={(event) => setForm({ ...form, account_currency: event.target.value })} placeholder="USD" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="bind-sync-start">同步开始日期（必填，UTC）</FieldLabel>
                    <Input id="bind-sync-start" type="date" min="1970-01-01" max={new Date().toISOString().slice(0, 10)} value={form.sync_start_date} onChange={(event) => setForm({ ...form, sync_start_date: event.target.value })} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>MT5 服务器时区（IANA，可选）</FieldLabel>
                  <Input value={form.server_timezone_name} onChange={(event) => setForm({ ...form, server_timezone_name: event.target.value })} placeholder="Europe/Helsinki" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bind-account-notes">账户备注（可选）</FieldLabel>
                  <Textarea id="bind-account-notes" maxLength={2000} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="账户用途、交易限制或注意事项" />
                  <p className="text-muted-foreground text-xs">{form.notes.length}/2000 字符，仅自己可见。</p>
                </Field>
              </FieldGroup>
              <p className="mt-3 text-muted-foreground text-sm">{form.sync_start_date ? `实际起点：${form.sync_start_date} 00:00:00 UTC。` : "请选择历史同步起点。"}按平仓时间判断，包含当天；历史能否补齐取决于 MT5 可取得的成交记录。</p>
              {formError && <FieldError className="mt-3">{formError}</FieldError>}
              <Button className="mt-4 w-full" onClick={createAccount} disabled={saving}>
                {saving ? "正在生成密钥..." : "生成密钥并绑定"}
              </Button>
            </ScrollArea>
          </DrawerContent>
        </Drawer>
      </div>

      <Button variant="outline" className="self-start" disabled={loading || saving} onClick={load}><RefreshCw data-icon="inline-start" />{loading ? "正在刷新…" : "刷新账户与同步状态"}</Button>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="绑定账号" value={`${accounts.length}`} hint={`${activeCount} 个启用`} />
        <SummaryCard title="同步有效订单" value={`${orderCount}`} hint="按 position_id 去重" />
        <SummaryCard title="原始成交" value={`${dealCount}`} hint="EA 上传事实条数" />
      </div>

      {pageError && <Badge variant="destructive" className="px-3 py-1.5">{pageError}</Badge>}

      <Card>
        <CardHeader>
          <CardTitle>已绑定账号</CardTitle>
          <CardDescription>完整与待核对数量按 Trade 生命周期统计；顶部有效订单数量按持仓号去重。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-3 p-4">
              {[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-muted/60" />)}
            </div>
          ) : accounts.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><ServerCog /></EmptyMedia>
                <EmptyTitle>还没有绑定账号</EmptyTitle>
                <EmptyDescription>点击右上角“绑定 MT5 账号”，生成密钥后写入 EA。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>账号</TableHead>
                    <TableHead>服务器 / 时区</TableHead>
                    <TableHead className="text-right">完整 / 待核对</TableHead>
                    <TableHead className="text-right">原始成交</TableHead>
                    <TableHead>最近连接 / 成功</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="font-medium">{account.label || account.mt5_login}</div>
                        <div className="font-mono text-muted-foreground text-xs">{account.mt5_login} · {account.key_prefix}…</div>
                        {account.notes && <p className="mt-1 max-w-xs line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground text-xs">{account.notes}</p>}
                      </TableCell>
                      <TableCell>
                        <div>{account.broker_server || "券商未设置"}</div>
                        <div className="text-muted-foreground text-xs">{account.server_timezone_name || "时区未设置"} · {account.account_currency || "币种未设置"}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{account.complete_trade_count} / {account.review_trade_count}</TableCell>
                      <TableCell className="text-right">{account.deal_count}</TableCell>
                      <TableCell>
                        <div className="text-xs">{formatDateTime(account.last_seen_at)}</div>
                        <div className="text-muted-foreground text-xs">{formatDateTime(account.last_success_sync_at)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.status === "active" ? "default" : "secondary"}>{account.status === "active" ? "启用" : "停用"}</Badge>
                        {account.sync_auth_error_active && <div className="mt-1"><Badge variant="destructive">同步密钥错误</Badge></div>}
                        <div className="text-muted-foreground text-xs">{account.resync_pending ? "重新同步中" : account.last_success_sync_at ? "已有成功同步" : "待首次成功同步"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingAccount(account)}>账户配置</Button>
                          <Button size="sm" variant="outline" onClick={() => setEaAccount(account)}>
                            <ServerCog className="size-3.5" />
                            EA 配置
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleStatus(account)}>
                            {account.status === "active" ? "停用" : "恢复"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setMaintenance({ account, action: "reset" })}>重同步</Button>
                          <Button size="sm" variant="destructive" onClick={() => setMaintenance({ account, action: "delete" })}>删除</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>数据维护记录</CardTitle><CardDescription>重同步和删除操作独立保留，账户删除后仍可核对操作原因和当时的数据范围。</CardDescription></CardHeader><CardContent>
        {!maintenanceAudits.length ? <p className="text-muted-foreground text-sm">暂无重同步或删除记录。</p> : <Table><TableHeader><TableRow><TableHead>时间</TableHead><TableHead>账号</TableHead><TableHead>操作</TableHead><TableHead>原因</TableHead><TableHead>影响范围</TableHead></TableRow></TableHeader><TableBody>
          {maintenanceAudits.map(item => <TableRow key={item.id}><TableCell>{formatDateTime(item.created_at)}</TableCell><TableCell className="font-mono">{item.mt5_login}</TableCell><TableCell><Badge variant={item.action === "delete" ? "destructive" : "secondary"}>{item.action === "delete" ? "删除" : "重同步"}</Badge></TableCell><TableCell className="max-w-sm whitespace-pre-wrap">{item.reason}</TableCell><TableCell>{Object.entries(item.counts).filter(([, count]) => count > 0).map(([name, count]) => `${namesForAudit[name] || name} ${count}`).join("、") || "无业务数据"}</TableCell></TableRow>)}
        </TableBody></Table>}
      </CardContent></Card>

      <EaConfigDrawer
        key={eaAccount?.id ?? "closed"}
        account={eaAccount}
        onClose={() => setEaAccount(null)}
        onKeyRotated={handleKeyRotated}
      />
      {maintenance && <AccountMaintenance key={`${maintenance.account.id}-${maintenance.action}`} {...maintenance}
        onClose={() => setMaintenance(null)} onChanged={() => { setEaAccount(null); void load(); }} />}
      {editingAccount && <AccountEditor key={editingAccount.id} account={editingAccount} onClose={() => setEditingAccount(null)}
        onSaved={(updated) => {
          window.dispatchEvent(new Event("tradesync-accounts-changed"));
          setAccounts((items) => items.map((item) => item.id === updated.id ? updated : item));
          setEaAccount((current) => current?.id === updated.id ? updated : current);
        }} />}

      <Drawer open={!!created} onOpenChange={(open) => !open && setCreated(null)} direction="right">
        <DrawerContent className="rounded-none sm:max-w-2xl">
          <DrawerHeader>
            <DrawerTitle>绑定成功</DrawerTitle>
            <DrawerDescription>请立即复制到 EA，此密钥之后不会再次完整显示。</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="min-h-0 flex-1 px-4 pb-6">
            <div className="flex flex-col gap-3">
              <Textarea readOnly value={created?.sync_key ?? ""} className="min-h-32 font-mono text-xs" />
              <CopyButton value={created?.sync_key ?? ""} label="复制同步密钥" />
              <EaConnection syncKey={created?.sync_key} />
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

const namesForAudit: Record<string, string> = { deals: "成交", snapshots: "资金快照", trade_lifecycles: "交易", trade_reviews: "复盘", review_attachments: "截图", sync_runs: "同步轮次", sync_batches: "同步批次", api_logs: "接口日志" };

function SummaryCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">{hint}</CardContent>
    </Card>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败，请手动选择内容复制");
    }
  }
  return (
    <Button type="button" variant="outline" onClick={copy} disabled={!value}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "已复制" : label}
    </Button>
  );
}

function EaConfigDrawer({
  account,
  onClose,
  onKeyRotated,
}: {
  account: Account | null;
  onClose: () => void;
  onKeyRotated: (account: AccountWithKey) => void;
}) {
  const [settings, setSettings] = useState<EaSettingsSnapshot[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState("");
  const accountId = account?.id;

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    setSettings([]);
    setSettingsError(null);
    setRotatedKey(null);
    setLoadingSettings(true);
    api.accountSettings(accountId, 3)
      .then((items) => active && setSettings(items))
      .catch((error) => {
        if (active) setSettingsError(error instanceof Error ? error.message : "参数快照加载失败");
      })
      .finally(() => active && setLoadingSettings(false));
    return () => {
      active = false;
    };
  }, [accountId]);

  async function rotateKey() {
    if (!account || rotating) return;
    if (!window.confirm("旧密钥会立即失效，EA 必须更新新密钥才能继续同步。交易数据与同步起点保持不变。确定重新生成吗？")) return;
    setRotating(true);
    try {
      const result = await api.regenerateKey(account.id);
      setRotatedKey(result.sync_key);
      onKeyRotated(result);
      toast.success("新密钥已生成，旧密钥已失效");
    } catch (err) {
      toast.error("重置密钥失败", { description: err instanceof Error ? err.message : "请稍后重试" });
    } finally {
      setRotating(false);
    }
  }

  const latestSettings = settings[0];


  return (
    <Drawer open={!!account} onOpenChange={(open) => { if (!open && !rotating && (!rotatedKey || window.confirm("新密钥仅本次完整显示，请确认已保存。关闭配置面板吗？"))) onClose(); }} direction="right">
      <DrawerContent className="rounded-none sm:max-w-3xl lg:max-w-5xl">
        <DrawerHeader>
          <DrawerTitle>EA 配置与连接信息</DrawerTitle>
          <DrawerDescription>低频配置集中在此处，主页面保留给同步结果和数据展示。</DrawerDescription>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 pb-6">
          {account && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <ConfigRow label="默认服务端地址（可在下方调整模板）" value={getEaServerOrigin()} />
                <ConfigRow label="接口根地址（调试用，勿填入 EA）" value={EA_API_BASE_URL} />
                <ConfigRow label="MT5 登录号" value={String(account.mt5_login)} />
                <ConfigRow label="券商服务器" value={account.broker_server ?? "未设置（本版 EA 不上传）"} />
                <ConfigRow label="MT5 服务器时区" value={account.server_timezone_name ?? "未设置（本版 EA 不上传）"} />
                <ConfigRow label="账号币种" value={account.account_currency ?? "未设置（本版 EA 不上传）"} />
                <ConfigRow label="最近连接" value={formatDateTime(account.last_seen_at)} />
                <ConfigRow label="最近成功同步" value={formatDateTime(account.last_success_sync_at)} />
                <ConfigRow label="同步游标" value={formatUtc(account.last_sync_time)} />
                <ConfigRow label="同步起点" value={formatUtc(account.sync_start_time)} />
                <ConfigRow label="最近平仓成交（UTC）" value={formatUtc(account.latest_close_time)} />
              </div>

              <EaConnection syncKey={rotatedKey ?? undefined} disabled={account.status === "disabled"} />

              {account.sync_auth_error_active && <Alert variant="destructive">
                <AlertTitle>EA 当前使用的同步密钥无效</AlertTitle>
                <AlertDescription>
                  最近失败：{formatDateTime(account.sync_auth_error_at)}（{account.sync_auth_error_code}）。当前Key生成于 {formatDateTime(account.key_created_at)}，{account.key_last_used_at ? `最近成功使用于 ${formatDateTime(account.key_last_used_at)}` : "生成后尚未被EA成功使用"}。请确认 EA 的 Inp_SecretKey 填写的是该账户生成的完整 sk_live_ 密钥，列表中的 {account.key_prefix}… 只是识别前缀，不能用于同步。若完整密钥已经丢失，请在下方重置密钥，并立即更新 EA 参数。
                </AlertDescription>
              </Alert>}

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">最近 EA 参数</CardTitle>
                  <CardDescription>
                    {latestSettings ? `快照时间：${formatUnix(latestSettings.snapshot_time)} · ${latestSettings.key_count} 项参数` : "EA 尚未上报参数快照"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Input aria-label="搜索 EA 参数" placeholder="搜索参数名、分组或参数值" value={settingsSearch} onChange={(e) => setSettingsSearch(e.target.value)} />
                  <p className="my-3 text-muted-foreground text-xs">只读快照，不代表实时配置；当前主 EA 不上报实例身份和版本。</p>
                  {latestSettings && Date.now() / 1000 - latestSettings.snapshot_time > 7200 && <Alert><AlertTitle>配置可能已过期</AlertTitle><AlertDescription>这份快照超过两小时未更新，可在 MT5 手动同步获取最近参数。</AlertDescription></Alert>}
                  {loadingSettings ? (
                    <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
                  ) : settingsError ? (
                    <Alert variant="destructive">
                      <AlertTitle>参数快照加载失败</AlertTitle>
                      <AlertDescription>{settingsError}。请关闭后重新打开此面板重试。</AlertDescription>
                    </Alert>
                  ) : latestSettings ? (
                    <EaSettingsView settings={latestSettings.settings} search={settingsSearch} />
                  ) : (
                    <p className="text-muted-foreground text-sm">EA 初始化或手动同步上传设置后，这里会显示风控、策略、周期和批量大小等参数。</p>
                  )}
                </CardContent>
              </Card>

              <AccountSymbolSpecs accountId={account.id} />

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                重置后旧密钥立即失效，需要把新密钥写入 EA 并重新加载。
              </div>
              <Button variant="outline" onClick={rotateKey} disabled={rotating}>
                <RefreshCw className={rotating ? "size-4 animate-spin" : "size-4"} />
                {rotating ? "正在重置..." : "重置同步密钥"}
              </Button>
              {rotatedKey && (
                <div className="flex flex-col gap-2">
                  <Textarea readOnly value={rotatedKey} className="min-h-28 font-mono text-xs" />
                  <CopyButton value={rotatedKey} label="复制新密钥" />
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Input readOnly value={value} className="font-mono text-xs" />
    </label>
  );
}

