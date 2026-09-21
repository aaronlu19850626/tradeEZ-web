"use client";

import { Check, Copy } from "lucide-react";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";
import { fill } from "@/lib/tradesync/account-center-i18n";

export function SyncKeyDialog({
  open,
  onOpenChange,
  t,
  name,
  syncKey,
  copied,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AccountCenterText;
  name: string;
  syncKey: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.keyTitle}</DialogTitle>
          <DialogDescription>{fill(t.keyDescription, { name })}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="rounded-lg border bg-muted/30 p-3 font-mono text-sm break-all">{syncKey}</div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.close}
          </Button>
          <Button onClick={onCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t.copied : t.copyKey}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
