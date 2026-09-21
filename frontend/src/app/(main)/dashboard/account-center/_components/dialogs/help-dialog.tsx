"use client";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";

import { HelpStep } from "../account-fields";

export function HelpDialog({
  open,
  onOpenChange,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AccountCenterText;
}) {
  const steps = [
    [t.helpStep1Title, t.helpStep1Body],
    [t.helpStep2Title, t.helpStep2Body],
    [t.helpStep3Title, t.helpStep3Body],
    [t.helpStep4Title, t.helpStep4Body],
    [t.helpStep5Title, t.helpStep5Body],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.helpTitle}</DialogTitle>
          <DialogDescription>{t.helpDescription}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 text-sm">
          {steps.map(([title, body], index) => (
            <HelpStep key={title} n={index + 1} title={title}>
              {body}
            </HelpStep>
          ))}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="font-medium">{t.helpFaq}</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              <li>{t.helpFaq1}</li>
              <li>{t.helpFaq2}</li>
              <li>{t.helpFaq3}</li>
            </ul>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t.helpGotIt}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
