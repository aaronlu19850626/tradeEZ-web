"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";

import {
  Check,
  CircleHelp,
  Copy,
  FileText,
  FileUp,
  HelpCircle,
  KeyRound,
  MoreVertical,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale } from "@/lib/i18n";
import {
  type AccountCenterItem,
  type AccountImportResult,
  accountCenterApi,
  importAccountDeals,
} from "@/lib/tradesync/account-center";
import { type AccountCenterText, accountCenterText, fill } from "@/lib/tradesync/account-center-i18n";
import { ApiClientError, clearSessionCookie, clearToken } from "@/lib/tradesync/api";

type Modal = "add" | "rename" | "key" | "rotate" | "reset" | "delete" | "import" | "help" | null;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatMoney(value: number | null, currency: string | null, locale: string): string {
  if (value === null || value === undefined) return "N/A";
  const symbol = currency === "USD" ? "$" : currency ? `${currency} ` : "$";
  return `${symbol}${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUpdatedAt(epoch: number | null, locale: string): { date: string; time: string } | null {
  if (epoch === null || epoch === undefined) return null;
  const date = new Date(epoch * 1000);
  return {
    date: date.toLocaleDateString(locale),
    time: date.toLocaleTimeString(locale, { hour12: false }),
  };
}

export default function AccountCenterPage() {
  const locale = useLocale();
  const t = accountCenterText[locale];
  const [accounts, setAccounts] = useState<AccountCenterItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<AccountCenterItem | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", server: "", login: "", syncStart: "" });
  const [confirmName, setConfirmName] = useState("");
  const [resetStart, setResetStart] = useState("");
  const [fileName, setFileName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<AccountImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await accountCenterApi.list());
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        clearToken();
        clearSessionCookie();
        window.location.assign("/auth/v2/login");
        return;
      }
      setError(errorMessage(err, t.genericError));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = () => {
    setModal(null);
    setSelected(null);
    setCurrentKey(null);
    setConfirmName("");
    setResetStart("");
    setFileName("");
    setImportFile(null);
    setImportResult(null);
    setImporting(false);
    setCopied(false);
  };

  const open = (next: Modal, account?: AccountCenterItem) => {
    setSelected(account ?? null);
    if (next === "rename" && account) {
      setForm({
        name: account.name ?? "",
        server: account.broker_server ?? "",
        login: String(account.mt5_login),
        syncStart: account.sync_start_date ?? "",
      });
    }
    setModal(next);
  };

  const showKey = async (account: AccountCenterItem) => {
    try {
      const data = await accountCenterApi.syncKey(account.id);
      setCurrentKey(data.sync_key);
      setSelected(account);
      setModal("key");
    } catch (err) {
      toast.error(errorMessage(err, t.genericError));
    }
  };

  const create = async () => {
    if (accounts && accounts.length >= 10) return toast.error(t.toastMaxAccounts);
    if (!form.name.trim() || !form.login.trim() || !form.syncStart) {
      return toast.error(t.toastFillRequired);
    }
    try {
      const created = await accountCenterApi.create({
        name: form.name.trim(),
        mt5_login: form.login.trim(),
        broker_server: form.server.trim() || null,
        sync_start_date: form.syncStart,
      });
      setForm({ name: "", server: "", login: "", syncStart: "" });
      setSelected(created);
      setCurrentKey(created.sync_key);
      setModal("key");
      await load();
      toast.success(t.toastCreated);
    } catch (err) {
      toast.error(errorMessage(err, t.genericError));
    }
  };

  const rename = async () => {
    if (!selected || !form.name.trim()) return;
    try {
      await accountCenterApi.update(selected.id, { name: form.name.trim() });
      close();
      await load();
      toast.success(t.toastRenamed);
    } catch (err) {
      toast.error(errorMessage(err, t.genericError));
    }
  };

  const toggleStatistics = async (account: AccountCenterItem) => {
    try {
      await accountCenterApi.update(account.id, { is_statistics: !account.is_statistics });
      await load();
      const name = account.name ?? t.accountFallback;
      toast.success(account.is_statistics ? fill(t.toastStatsOff, { name }) : fill(t.toastStatsOn, { name }));
    } catch (err) {
      toast.error(errorMessage(err, t.genericError));
    }
  };

  const rotate = async () => {
    if (!selected) return;
    try {
      const data = await accountCenterApi.regenerateKey(selected.id);
      setSelected(data);
      setCurrentKey(data.sync_key);
      setModal("key");
      await load();
      toast.success(t.toastKeyRotated);
    } catch (err) {
      toast.error(errorMessage(err, t.genericError));
    }
  };

  const resetTrades = async () => {
    if (!selected || !resetStart || confirmName.trim() !== (selected.name ?? "")) {
      return toast.error(t.toastResetFill);
    }
    try {
      await accountCenterApi.resetSync(selected.id, { name: confirmName.trim(), sync_start_date: resetStart });
      close();
      await load();
      toast.success(t.toastResetDone);
    } catch (err) {
      toast.error(errorMessage(err, t.genericError));
    }
  };

  const remove = async () => {
    if (!selected || confirmName.trim() !== (selected.name ?? "")) {
      return toast.error(t.toastDeleteFill);
    }
    try {
      await accountCenterApi.delete(selected.id, { name: confirmName.trim() });
      close();
      await load();
      toast.success(t.toastDeleted);
    } catch (err) {
      toast.error(errorMessage(err, t.genericError));
    }
  };

  const copyKey = async () => {
    if (!currentKey) return;
    await navigator.clipboard?.writeText(currentKey);
    setCopied(true);
    toast.success(t.toastKeyCopied);
  };

  const submitImport = async () => {
    if (!selected || !importFile) return;
    setImporting(true);
    try {
      const result = await importAccountDeals(selected.id, importFile);
      setImportResult(result);
      await load();
      toast.success(
        fill(t.toastImportDone, {
          imported: result.imported_rows,
          duplicate: result.duplicate_rows,
          error: result.error_rows,
        }),
      );
    } catch (err) {
      toast.error(errorMessage(err, t.genericError));
    } finally {
      setImporting(false);
    }
  };

  const healthy = accounts?.filter((a) => a.ea_status === "online").length ?? 0;
  const totalTrades = accounts?.reduce((sum, a) => sum + a.trade_count, 0) ?? 0;
  const fallbackName = selected?.name ?? t.accountFallback;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => open("help")}>
            <HelpCircle className="size-4" />
            {t.helpEa}
          </Button>
          <Button size="sm" disabled={loading || (accounts?.length ?? 0) >= 10} onClick={() => open("add")}>
            <Plus className="size-4" />
            {(accounts?.length ?? 0) >= 10 ? t.accountLimitReached : t.addAccount}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric
          title={t.metricAccounts}
          tip={t.metricAccountsTip}
          value={accounts ? `${accounts.length} / 10` : "—"}
          suffix={accounts ? t.metricAccountsSuffix : ""}
        />
        <Metric
          title={t.metricHeartbeat}
          tip={t.metricHeartbeatTip}
          value={accounts ? `${healthy} / ${accounts.length}` : "—"}
          suffix=""
        />
        <Metric
          title={t.metricTrades}
          tip={t.metricTradesTip}
          value={accounts ? `${totalTrades}` : "—"}
          suffix={accounts ? t.metricTradesSuffix : ""}
        />
      </div>

      <Card className="account-center-card gap-0 overflow-visible pt-0 pb-4">
        <CardHeader
          className="flex flex-row items-center justify-between bg-muted/20 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <CardTitle className="text-base font-bold">{t.activeAccounts}</CardTitle>
          <Button variant="ghost" size="icon-sm" aria-label={t.refresh} onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" />
          </Button>
        </CardHeader>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">{t.loading}</div>
        ) : error ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              {t.retry}
            </Button>
          </div>
        ) : accounts?.length === 0 ? (
          <EmptyState t={t} onAdd={() => open("add")} />
        ) : (
          <div className="account-center-table overflow-visible">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
                  <TableHead className="h-10 pl-5 font-bold">{t.tableName}</TableHead>
                  <TableHead className="h-10 font-bold">{t.tableMt5}</TableHead>
                  <TableHead className="h-10 font-bold">{t.tableBalanceEquity}</TableHead>
                  <TableHead className="h-10 font-bold">{t.tableUpdated}</TableHead>
                  <TableHead className="h-10 font-bold">{t.tableEa}</TableHead>
                  <TableHead className="h-10 font-bold">{t.tableTrades}</TableHead>
                  <TableHead className="h-10 pr-5 text-right font-bold">{t.tableActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts?.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    t={t}
                    locale={locale}
                    onRename={() => open("rename", account)}
                    onToggle={() => toggleStatistics(account)}
                    onReport={() => toast.info(t.reportPlaceholder)}
                    onKey={() => showKey(account)}
                    onImport={() => open("import", account)}
                    onRotate={() => open("rotate", account)}
                    onReset={() => open("reset", account)}
                    onDelete={() => open("delete", account)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {accounts && accounts.length > 0 && !accounts.some((a) => a.is_statistics) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t.noStatisticsHint}
        </p>
      )}

      <Dialog open={modal === "add"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t.addTitle}</DialogTitle>
            <DialogDescription>{t.addDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label={t.fieldName} required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field
              label={t.fieldServer}
              value={form.server}
              onChange={(v) => setForm({ ...form, server: v })}
              placeholder={t.serverPlaceholder}
            />
            <Field label={t.fieldLogin} required value={form.login} onChange={(v) => setForm({ ...form, login: v })} />
            <Field
              label={t.fieldSyncStart}
              required
              type="date"
              value={form.syncStart}
              onChange={(v) => setForm({ ...form, syncStart: v })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t.cancel}
            </Button>
            <Button onClick={create}>{t.createAccount}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "rename"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.renameTitle}</DialogTitle>
          </DialogHeader>
          <Field label={t.fieldName} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t.cancel}
            </Button>
            <Button onClick={rename}>{t.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "key"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.keyTitle}</DialogTitle>
            <DialogDescription>{fill(t.keyDescription, { name: fallbackName })}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 font-mono text-sm break-all">{currentKey}</div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t.close}
            </Button>
            <Button onClick={copyKey}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t.copied : t.copyKey}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "rotate"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.rotateTitle}</DialogTitle>
            <DialogDescription>{t.rotateDescription}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{t.rotateWarning}</div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t.cancel}
            </Button>
            <Button variant="destructive" onClick={rotate}>
              {t.confirmResetKey}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "reset"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.resetTitle}</DialogTitle>
            <DialogDescription>{fill(t.resetDescription, { name: fallbackName })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label={t.resetStartLabel} required type="date" value={resetStart} onChange={setResetStart} />
            <Field
              label={t.confirmNameLabel}
              value={confirmName}
              onChange={setConfirmName}
              placeholder={selected?.name ?? ""}
            />
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{t.resetWarning}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={!resetStart || confirmName.trim() !== (selected?.name ?? "")}
              onClick={resetTrades}
            >
              {t.confirmReset}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "delete"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.deleteTitle}</DialogTitle>
            <DialogDescription>{fill(t.deleteDescription, { name: fallbackName })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
              {t.deleteWarning}
            </div>
            <Field
              label={t.confirmNameLabel}
              value={confirmName}
              onChange={setConfirmName}
              placeholder={selected?.name ?? ""}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t.cancel}
            </Button>
            <Button variant="destructive" disabled={confirmName.trim() !== (selected?.name ?? "")} onClick={remove}>
              <Trash2 className="size-4" />
              {t.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "help"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t.helpTitle}</DialogTitle>
            <DialogDescription>{t.helpDescription}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
            <HelpStep n={1} title={t.helpStep1Title}>
              {t.helpStep1Body}
            </HelpStep>
            <HelpStep n={2} title={t.helpStep2Title}>
              {t.helpStep2Body}
            </HelpStep>
            <HelpStep n={3} title={t.helpStep3Title}>
              {t.helpStep3Body}
            </HelpStep>
            <HelpStep n={4} title={t.helpStep4Title}>
              {t.helpStep4Body}
            </HelpStep>
            <HelpStep n={5} title={t.helpStep5Title}>
              {t.helpStep5Body}
            </HelpStep>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="font-medium">{t.helpFaq}</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                <li>{t.helpFaq1}</li>
                <li>{t.helpFaq2}</li>
                <li>{t.helpFaq3}</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={close}>{t.helpGotIt}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "import"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.importTitle}</DialogTitle>
            <DialogDescription>
              {fill(t.importDescription, { name: fallbackName, login: selected ? String(selected.mt5_login) : "" })}
            </DialogDescription>
          </DialogHeader>
          {importResult ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-lg font-semibold">{importResult.imported_rows}</p>
                  <p className="text-xs text-muted-foreground">{t.importNew}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-lg font-semibold">{importResult.duplicate_rows}</p>
                  <p className="text-xs text-muted-foreground">{t.importDuplicate}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-lg font-semibold">{importResult.error_rows}</p>
                  <p className="text-xs text-muted-foreground">{t.importError}</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs">
                  {importResult.errors.map((item) => (
                    <p key={`${item.row_number}-${item.reason}`}>
                      {fill(t.importRowError, { row: item.row_number, reason: item.reason })}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
              <FileUp className="size-8 text-muted-foreground" />
              <p className="font-medium">{fileName || t.chooseCsv}</p>
              <p className="text-xs text-muted-foreground">{t.csvHint}</p>
              <label className="cursor-pointer">
                <Button asChild variant="outline">
                  <span>
                    <Upload className="size-4" />
                    {t.chooseFile}
                  </span>
                </Button>
                <input
                  className="sr-only"
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setImportFile(file);
                    setFileName(file?.name ?? "");
                    setImportResult(null);
                  }}
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t.cancel}
            </Button>
            {importResult ? (
              <Button onClick={close}>{t.done}</Button>
            ) : (
              <Button disabled={!importFile || importing} onClick={submitImport}>
                {importing ? t.importing : t.startImport}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountRow({
  account,
  t,
  locale,
  onRename,
  onToggle,
  onReport,
  onKey,
  onImport,
  onRotate,
  onReset,
  onDelete,
}: {
  account: AccountCenterItem;
  t: AccountCenterText;
  locale: string;
  onRename: () => void;
  onToggle: () => void;
  onReport: () => void;
  onKey: () => void;
  onImport: () => void;
  onRotate: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const updated = formatUpdatedAt(account.last_updated_at, locale);
  return (
    <TableRow className="border-b bg-card transition-colors hover:bg-muted/25">
      <TableCell className="pl-5">
        <div className="flex items-center gap-2">
          <button type="button" className="font-semibold text-primary hover:underline" onClick={onRename}>
            {account.name ?? t.unnamed}
          </button>
          {account.is_statistics && (
            <Badge className="border-primary/20 bg-primary/10 text-primary text-xs">{t.statisticsAccount}</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-semibold tracking-wide text-foreground/80">{t.syncStart}</span>
          <span className="ml-1">{account.sync_start_date ?? "N/A"}</span>
        </p>
      </TableCell>
      <TableCell>
        <div className="font-medium">{account.broker_server ?? "N/A"}</div>
        <div className="mt-1 rounded-md bg-muted px-2 py-1 font-mono text-sm font-medium">
          {String(account.mt5_login)}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-lg font-semibold tabular-nums">
          {formatMoney(account.balance, account.currency, locale)}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t.equity} {formatMoney(account.equity, account.currency, locale)}
        </p>
      </TableCell>
      <TableCell>
        {updated ? (
          <div className="inline-flex flex-col rounded-md bg-muted/60 px-2 py-1 font-mono text-sm leading-tight">
            <span>{updated.date}</span>
            <span className="mt-1 text-xs text-muted-foreground">{updated.time}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{t.noSnapshot}</span>
        )}
      </TableCell>
      <TableCell>
        {account.ea_status === "online" ? (
          <Badge
            variant="outline"
            className="gap-2 border-[#b8dfd2] bg-[#eef8f4] text-[#17624f] shadow-[inset_0_0_0_1px_rgba(23,98,79,0.03)]"
          >
            <span className="size-1.5 rounded-full bg-[#27a47c] shadow-[0_0_0_3px_rgba(39,164,124,0.12)]" />
            {t.syncing}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-2 border-[#edcaca] bg-[#fff4f3] text-[#9d4545] shadow-[inset_0_0_0_1px_rgba(157,69,69,0.03)]"
          >
            <span className="size-1.5 rounded-full bg-[#cf6262] shadow-[0_0_0_3px_rgba(207,98,98,0.11)]" />
            {t.noEa}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="text-lg font-semibold text-foreground">{account.trade_count}</span>
        <span className="ml-1 text-sm text-muted-foreground">{t.tradesUnit}</span>
      </TableCell>
      <TableCell className="pr-5">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <InlineAction
            label={account.is_statistics ? t.actionToggleOff : t.actionToggleOn}
            icon={account.is_statistics ? <StarOff /> : <Star />}
            onClick={onToggle}
          />
          <InlineAction label={t.actionReport} icon={<FileText />} onClick={onReport} />
          <InlineAction label={t.actionViewKey} icon={<KeyRound />} onClick={onKey} />
          <InlineAction label={t.actionImport} icon={<Upload />} onClick={onImport} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`${account.name ?? t.unnamed} ${t.actionMore}`}>
                <MoreVertical className="size-4" strokeWidth={2.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                className="cursor-pointer text-amber-600 hover:text-amber-700 dark:text-amber-400"
                onSelect={onRotate}
              >
                <RotateCcw />
                {t.actionResetKey}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-amber-600 hover:text-amber-700 dark:text-amber-400"
                onSelect={onReset}
              >
                <RefreshCw />
                {t.actionResetTrades}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" variant="destructive" onSelect={onDelete}>
                <Trash2 />
                {t.actionDelete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

function InlineAction({
  label,
  icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "warning" | "danger";
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={`h-9 gap-1 px-2 text-sm ${tone === "danger" ? "text-destructive hover:text-destructive" : tone === "warning" ? "text-amber-600 hover:text-amber-700 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon}
      {label}
    </Button>
  );
}

function HelpStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="font-medium">
        {n}. {title}
      </p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  );
}

function Metric({ title, tip, value, suffix }: { title: string; tip: string; value: string; suffix: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <span>{title}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground/70 hover:text-foreground" aria-label={title}>
                <CircleHelp className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tip}</TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="metric-value font-semibold">
        {value}
        <span className="ml-2 text-sm font-normal text-muted-foreground">{suffix}</span>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function EmptyState({ t, onAdd }: { t: AccountCenterText; onAdd: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <KeyRound className="size-6" />
      </div>
      <div>
        <h3 className="font-semibold">{t.emptyTitle}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t.emptyBody}</p>
      </div>
      <Button onClick={onAdd}>
        <Plus className="size-4" />
        {t.addAccountEmpty}
      </Button>
    </div>
  );
}
