"use client";

import { useEffect, useState } from "react";

import { Search } from "lucide-react";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";

import { type ColumnKey, OPTIONAL_COLUMNS } from "../_lib/trade-center-model";
import { columnLabel } from "./trade-table";

export function ColumnPickerDialog({
  t,
  open,
  columns,
  defaultColumns,
  onOpenChange,
  onApply,
}: {
  t: TradeCenterText;
  open: boolean;
  columns: ColumnKey[];
  defaultColumns: ColumnKey[];
  onOpenChange: (open: boolean) => void;
  onApply: (columns: ColumnKey[]) => void;
}) {
  const [draft, setDraft] = useState<ColumnKey[]>(columns);
  const [query, setQuery] = useState("");

  // The toolbar opens the dialog directly, so reseed the draft from the active
  // view's columns every time it opens instead of trusting the mount value.
  useEffect(() => {
    if (!open) return;
    setDraft(columns);
    setQuery("");
  }, [open, columns]);

  const labels = new Map<ColumnKey, string>();
  for (const key of OPTIONAL_COLUMNS) labels.set(key, columnLabel(key, t));

  const visible = OPTIONAL_COLUMNS.filter((key) =>
    (labels.get(key) ?? "").toLowerCase().includes(query.trim().toLowerCase()),
  );
  const allSelected = draft.length === OPTIONAL_COLUMNS.length;

  const toggle = (key: ColumnKey) => {
    setDraft((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.columnsTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.columnsDescription}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.columnsSearch}
                className="pl-8"
              />
            </div>
            <Button variant="outline" onClick={() => setDraft(defaultColumns)}>
              {t.columnsDefault}
            </Button>
          </div>
          <div className="mt-3 rounded-lg border">
            <Label className="flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2.5 hover:bg-muted/50">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => setDraft(checked ? [...OPTIONAL_COLUMNS] : [])}
              />
              <span className="text-sm font-semibold">{t.columnsSelectAll}</span>
            </Label>
            {visible.map((key) => (
              <Label key={key} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                <Checkbox checked={draft.includes(key)} onCheckedChange={() => toggle(key)} />
                <span className="text-sm">{labels.get(key)}</span>
              </Label>
            ))}
            {visible.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">{t.columnsEmpty}</p>}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button
            onClick={() => {
              onApply(OPTIONAL_COLUMNS.filter((key) => draft.includes(key)));
              onOpenChange(false);
            }}
          >
            {t.update}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
