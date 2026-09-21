"use client";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

export function ResetKeyDialog({
  open,
  onOpenChange,
  t,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AccountCenterText;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.rotateTitle}</DialogTitle>
          <DialogDescription>{t.rotateDescription}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">{t.rotateWarning}</div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t.confirmResetKey}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
