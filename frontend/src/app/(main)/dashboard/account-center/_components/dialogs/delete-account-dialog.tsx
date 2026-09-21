"use client";

import { Trash2 } from "lucide-react";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";
import { fill } from "@/lib/tradesync/account-center-i18n";

import { Field } from "../account-fields";

export function DeleteAccountDialog({
  open,
  onOpenChange,
  t,
  name,
  confirmName,
  onConfirmName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AccountCenterText;
  name: string;
  confirmName: string;
  onConfirmName: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.deleteTitle}</DialogTitle>
          <DialogDescription>{fill(t.deleteDescription, { name })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{t.deleteWarning}</div>
          <Field label={t.confirmNameLabel} value={confirmName} onChange={onConfirmName} placeholder={name} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button variant="destructive" disabled={confirmName.trim() !== name} onClick={onConfirm}>
            <Trash2 className="size-4" />
            {t.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
