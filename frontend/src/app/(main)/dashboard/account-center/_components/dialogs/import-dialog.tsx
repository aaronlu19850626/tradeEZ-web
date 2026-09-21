"use client";

import { FileUp, Upload } from "lucide-react";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountImportResult } from "@/lib/tradesync/account-center";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";
import { fill } from "@/lib/tradesync/account-center-i18n";

export function ImportDialog({
  open,
  onOpenChange,
  t,
  name,
  login,
  fileName,
  file,
  importing,
  result,
  onFile,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AccountCenterText;
  name: string;
  login: string;
  fileName: string;
  file: File | null;
  importing: boolean;
  result: AccountImportResult | null;
  onFile: (file: File | null) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.importTitle}</DialogTitle>
          <DialogDescription>{fill(t.importDescription, { name, login })}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {result ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-lg font-semibold">{result.imported_rows}</p>
                  <p className="text-xs text-muted-foreground">{t.importNew}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-lg font-semibold">{result.duplicate_rows}</p>
                  <p className="text-xs text-muted-foreground">{t.importDuplicate}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-lg font-semibold">{result.error_rows}</p>
                  <p className="text-xs text-muted-foreground">{t.importError}</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="space-y-1 rounded-lg border p-3 text-xs">
                  {result.errors.map((item) => (
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
                  onChange={(event) => onFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>{t.done}</Button>
          ) : (
            <Button disabled={!file || importing} onClick={onSubmit}>
              {importing ? t.importing : t.startImport}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
