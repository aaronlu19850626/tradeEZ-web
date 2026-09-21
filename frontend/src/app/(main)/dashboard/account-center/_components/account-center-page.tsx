"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";
import {
  type AccountCenterItem,
  type AccountImportResult,
  accountCenterApi,
  importAccountDeals,
} from "@/lib/tradesync/account-center";
import { type AccountCenterText, accountCenterText, fill } from "@/lib/tradesync/account-center-i18n";
import { ApiClientError, clearSessionCookie, clearToken } from "@/lib/tradesync/api";

import { type AccountForm, EMPTY_ACCOUNT_FORM, errorMessage, type Modal } from "../_lib/account-center-model";
import { accountTableColumns, EmptyState, Metric } from "./account-center-ui";
import { AccountHeader } from "./account-header";
import { AddAccountDialog } from "./dialogs/add-account-dialog";
import { DeleteAccountDialog } from "./dialogs/delete-account-dialog";
import { HelpDialog } from "./dialogs/help-dialog";
import { ImportDialog } from "./dialogs/import-dialog";
import { RenameAccountDialog } from "./dialogs/rename-account-dialog";
import { ResetKeyDialog } from "./dialogs/reset-key-dialog";
import { ResetTradesDialog } from "./dialogs/reset-trades-dialog";
import { SyncKeyDialog } from "./dialogs/sync-key-dialog";

export default function AccountCenterPage() {
  const locale = useLocale();
  const t = accountCenterText[locale];
  const [accounts, setAccounts] = useState<AccountCenterItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<AccountCenterItem | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_ACCOUNT_FORM);
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
    setForm(EMPTY_ACCOUNT_FORM);
  };

  const open = (next: Modal, account?: AccountCenterItem) => {
    setSelected(account ?? null);
    if (next === "rename" && account) {
      setForm({
        name: account.name ?? "",
        platform: account.platform,
        currency: account.currency ?? "USD",
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
    if (!form.name.trim() || !form.platform || !form.currency || !form.login.trim()) {
      return toast.error(t.toastFillRequired);
    }
    try {
      const created = await accountCenterApi.create({
        name: form.name.trim(),
        platform: form.platform,
        currency: form.currency,
        mt5_login: form.login.trim(),
        broker_server: form.server.trim() || null,
        sync_start_date: form.syncStart || null,
      });
      setForm(EMPTY_ACCOUNT_FORM);
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

  const healthy = accounts?.filter((account) => account.ea_status === "online").length ?? 0;
  const totalTrades = accounts?.reduce((sum, account) => sum + account.trade_count, 0) ?? 0;
  const fallbackName = selected?.name ?? t.accountFallback;
  const closeOnOpenChange = (open: boolean) => {
    if (!open) close();
  };

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6">
      <AccountHeader
        t={t}
        loading={loading}
        accountCount={accounts?.length ?? 0}
        onHelp={() => open("help")}
        onAdd={() => open("add")}
      />

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

      <AccountTableCard
        t={t}
        locale={locale}
        accounts={accounts}
        loading={loading}
        error={error}
        onReload={() => void load()}
        onAdd={() => open("add")}
        onRename={(account) => open("rename", account)}
        onToggle={(account) => void toggleStatistics(account)}
        onReport={() => toast.info(t.reportPlaceholder)}
        onKey={(account) => void showKey(account)}
        onImport={(account) => open("import", account)}
        onRotate={(account) => open("rotate", account)}
        onReset={(account) => open("reset", account)}
        onDelete={(account) => open("delete", account)}
      />

      {accounts && accounts.length > 0 && !accounts.some((account) => account.is_statistics) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t.noStatisticsHint}
        </p>
      )}

      <AddAccountDialog
        open={modal === "add"}
        onOpenChange={closeOnOpenChange}
        t={t}
        form={form}
        onFormChange={setForm}
        onCreate={create}
      />
      <RenameAccountDialog
        open={modal === "rename"}
        onOpenChange={closeOnOpenChange}
        t={t}
        value={form.name}
        onChange={(name) => setForm({ ...form, name })}
        onSave={rename}
      />
      <SyncKeyDialog
        open={modal === "key"}
        onOpenChange={closeOnOpenChange}
        t={t}
        name={fallbackName}
        syncKey={currentKey}
        copied={copied}
        onCopy={copyKey}
      />
      <ResetKeyDialog open={modal === "rotate"} onOpenChange={closeOnOpenChange} t={t} onConfirm={rotate} />
      <ResetTradesDialog
        open={modal === "reset"}
        onOpenChange={closeOnOpenChange}
        t={t}
        name={fallbackName}
        resetStart={resetStart}
        onResetStart={setResetStart}
        confirmName={confirmName}
        onConfirmName={setConfirmName}
        onConfirm={resetTrades}
      />
      <DeleteAccountDialog
        open={modal === "delete"}
        onOpenChange={closeOnOpenChange}
        t={t}
        name={fallbackName}
        confirmName={confirmName}
        onConfirmName={setConfirmName}
        onConfirm={remove}
      />
      <HelpDialog open={modal === "help"} onOpenChange={closeOnOpenChange} t={t} />
      <ImportDialog
        open={modal === "import"}
        onOpenChange={closeOnOpenChange}
        t={t}
        name={fallbackName}
        login={selected ? String(selected.mt5_login) : ""}
        fileName={fileName}
        file={importFile}
        importing={importing}
        result={importResult}
        onFile={(file) => {
          setImportFile(file);
          setFileName(file?.name ?? "");
          setImportResult(null);
        }}
        onSubmit={submitImport}
      />
    </div>
  );
}

function AccountTableCard({
  t,
  locale,
  accounts,
  loading,
  error,
  onReload,
  onAdd,
  onRename,
  onToggle,
  onReport,
  onKey,
  onImport,
  onRotate,
  onReset,
  onDelete,
}: {
  t: AccountCenterText;
  locale: string;
  accounts: AccountCenterItem[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onAdd: () => void;
  onRename: (account: AccountCenterItem) => void;
  onToggle: (account: AccountCenterItem) => void;
  onReport: (account: AccountCenterItem) => void;
  onKey: (account: AccountCenterItem) => void;
  onImport: (account: AccountCenterItem) => void;
  onRotate: (account: AccountCenterItem) => void;
  onReset: (account: AccountCenterItem) => void;
  onDelete: (account: AccountCenterItem) => void;
}) {
  return (
    <Card className="gap-0 overflow-visible pt-0 pb-4">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 py-2">
        <CardTitle className="text-base font-bold">{t.activeAccounts}</CardTitle>
        <Button variant="ghost" size="icon-sm" aria-label={t.refresh} onClick={onReload} disabled={loading}>
          <RefreshCw className="size-4" />
        </Button>
      </CardHeader>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">{t.loading}</div>
      ) : error ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={onReload}>
            {t.retry}
          </Button>
        </div>
      ) : accounts?.length === 0 ? (
        <EmptyState t={t} onAdd={onAdd} />
      ) : (
        <DataTable
          columns={accountTableColumns({
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
          })}
          data={accounts ?? []}
          getRowId={(account) => String(account.id)}
          className="rounded-none border-0"
          tableClassName="min-w-[1350px]"
          rowClassName="bg-card transition-colors hover:bg-muted/25"
        />
      )}
    </Card>
  );
}
