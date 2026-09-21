"use client";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { DatePickerField } from "@/components/filters/date-picker-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";
import { fill } from "@/lib/tradesync/account-center-i18n";

import { Field } from "../account-fields";

export function ResetTradesDialog({
  open,
  onOpenChange,
  t,
  name,
  resetStart,
  onResetStart,
  confirmName,
  onConfirmName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AccountCenterText;
  name: string;
  resetStart: string;
  onResetStart: (value: string) => void;
  confirmName: string;
  onConfirmName: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.resetTitle}</DialogTitle>
          <DialogDescription>{fill(t.resetDescription, { name })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <DatePickerField
            label={t.resetStartLabel}
            required
            value={resetStart}
            onChange={onResetStart}
            placeholder={t.datePlaceholder}
            clearLabel={t.dateClear}
          />
          <Field label={t.confirmNameLabel} value={confirmName} onChange={onConfirmName} placeholder={name} />
          <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <p className="font-medium">{t.resetWarning}</p>
            <ul className="list-disc space-y-1 pl-4 text-foreground/80">
              <li>{t.resetImpactClear}</li>
              <li>{t.resetImpactResync}</li>
              <li>{t.resetImpactPending}</li>
            </ul>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button variant="destructive" disabled={!resetStart || confirmName.trim() !== name} onClick={onConfirm}>
            {t.confirmReset}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
