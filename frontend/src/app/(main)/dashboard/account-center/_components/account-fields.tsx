"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HelpStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="font-medium">
        {n}. {title}
      </p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
