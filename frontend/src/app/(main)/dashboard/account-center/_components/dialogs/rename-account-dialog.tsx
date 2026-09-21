"use client";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

import { Field } from "../account-fields";

export function RenameAccountDialog({
  open,
  onOpenChange,
  t,
  value,
  onChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AccountCenterText;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.renameTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.renameTitle}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t.fieldName} value={value} onChange={onChange} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button onClick={onSave}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
