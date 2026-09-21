"use client";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { CurrencySelect } from "@/components/domain/currency-select";
import { PlatformSelect } from "@/components/domain/platform-select";
import { DatePickerField } from "@/components/filters/date-picker-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountCenterText } from "@/lib/tradesync/account-center-i18n";
import { defaultCurrencyForPlatform } from "@/lib/tradesync/currencies";

import type { AccountForm } from "../../_lib/account-center-model";
import { Field } from "../account-fields";

export function AddAccountDialog({
  open,
  onOpenChange,
  t,
  form,
  onFormChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AccountCenterText;
  form: AccountForm;
  onFormChange: (form: AccountForm) => void;
  onCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.addTitle}</DialogTitle>
          <DialogDescription>{t.addDescription}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid max-h-[calc(100dvh-13rem)] gap-3">
          <Field
            label={t.fieldName}
            required
            value={form.name}
            onChange={(value) => onFormChange({ ...form, name: value })}
          />
          <PlatformSelect
            label={t.fieldPlatform}
            required
            value={form.platform}
            onChange={(value) =>
              onFormChange({ ...form, platform: value, currency: defaultCurrencyForPlatform(value) })
            }
          />
          <CurrencySelect
            label={t.fieldCurrency}
            required
            value={form.currency}
            onChange={(value) => onFormChange({ ...form, currency: value })}
            disabled={form.platform === "ctp"}
          />
          <Field
            label={t.fieldServer}
            value={form.server}
            onChange={(value) => onFormChange({ ...form, server: value })}
            placeholder={t.serverPlaceholder}
          />
          <Field
            label={t.fieldLogin}
            required
            value={form.login}
            onChange={(value) => onFormChange({ ...form, login: value })}
          />
          <DatePickerField
            label={t.fieldSyncStart}
            value={form.syncStart}
            onChange={(value) => onFormChange({ ...form, syncStart: value })}
            placeholder={t.datePlaceholder}
            clearLabel={t.dateClear}
            hint={t.syncStartHint}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button onClick={onCreate}>{t.createAccount}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
