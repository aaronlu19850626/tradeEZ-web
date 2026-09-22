"use client";

import { type ReactNode, useState } from "react";

import { Check, ChevronDown, ChevronUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface SelectConditionGroup {
  id: string;
  label: string;
  mode?: "single" | "multiple";
  options: SelectOption[];
}

export function SelectSingleControl({
  value,
  options,
  placeholder = "请选择",
  onValueChange,
  align = "end",
  className,
}: {
  value: string | null;
  options: SelectOption[];
  placeholder?: string;
  onValueChange: (value: string) => void;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 w-auto gap-2 px-2.5 text-sm leading-none font-normal ${
            selected ? "font-semibold text-foreground" : "text-muted-foreground"
          } ${className ?? ""}`}
        >
          {selected?.icon}
          <span className="min-w-0 whitespace-nowrap">{selected ? selected.label : placeholder}</span>
          {open ? <ChevronUp className="size-3.5 opacity-50" /> : <ChevronDown className="size-3.5 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={6} className="min-w-44 space-y-0.5 rounded-lg p-1">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              className="cursor-pointer gap-2 rounded-md px-2 py-1.5 text-sm leading-normal font-normal text-foreground"
              onSelect={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {isSelected && <Check className="size-4 text-primary" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SelectMultiConditionControl({
  value,
  groups,
  title = "筛选器",
  noneLabel = "无",
  onChange,
  align = "end",
  clearLabel = "清空条件",
  confirmLabel = "确认",
}: {
  value: Record<string, string[]>;
  groups: SelectConditionGroup[];
  title?: string;
  noneLabel?: string;
  onChange: (value: Record<string, string[]>) => void;
  align?: "start" | "center" | "end";
  clearLabel?: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>(value);
  const allOptions = groups.flatMap((group) => group.options);
  const selectedValues = Object.values(value).flat();
  const selected = allOptions.filter((option) => selectedValues.includes(option.value));
  const isDefault = selectedValues.length === 0;
  const summary =
    selected.length <= 2
      ? selected.map((option) => option.label).join("/")
      : `${selected[0].label}/${selected[1].label} 等${selected.length}项`;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 w-auto gap-2 px-2.5 text-sm leading-none ${
            isDefault ? "font-semibold text-muted-foreground" : "font-semibold text-foreground"
          }`}
        >
          <span className="min-w-0 whitespace-nowrap">
            {isDefault ? `${title} · ${noneLabel}` : `${title} · ${summary}`}
          </span>
          {open ? <ChevronUp className="size-3.5 opacity-50" /> : <ChevronDown className="size-3.5 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={6} className="min-w-56 rounded-lg p-1">
        <DropdownMenuItem
          className="cursor-pointer gap-2 rounded-md px-2 py-1.5 text-sm font-normal text-muted-foreground"
          onSelect={() => {
            setDraft({});
            onChange({});
            setOpen(false);
          }}
        >
          <X className="size-4" />
          <span className="min-w-0 flex-1 text-left">{clearLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        {groups.map((group, groupIndex) => (
          <div key={group.id}>
            <DropdownMenuLabel className="px-2 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.mode === "single" ? (
              <RadioGroup
                value={draft[group.id]?.[0] ?? ""}
                onValueChange={(next) => setDraft((prev) => ({ ...prev, [group.id]: [next] }))}
                className="max-h-40 gap-0 overflow-y-auto"
              >
                {group.options.map((option) => (
                  <label
                    key={option.value}
                    htmlFor={`condition-${group.id}-${option.value}`}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-normal text-foreground hover:bg-accent"
                  >
                    <RadioGroupItem id={`condition-${group.id}-${option.value}`} value={option.value} />
                    <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                  </label>
                ))}
              </RadioGroup>
            ) : (
              <div className="max-h-40 overflow-y-auto">
                {group.options.map((option) => {
                  const groupValue = draft[group.id] ?? [];
                  const checked = groupValue.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      htmlFor={`condition-${group.id}-${option.value}`}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-normal text-foreground hover:bg-accent"
                    >
                      <Checkbox
                        id={`condition-${group.id}-${option.value}`}
                        checked={checked}
                        onCheckedChange={() =>
                          setDraft((prev) => {
                            const current = prev[group.id] ?? [];
                            return {
                              ...prev,
                              [group.id]: checked
                                ? current.filter((item) => item !== option.value)
                                : [...current, option.value],
                            };
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {groupIndex < groups.length - 1 && <DropdownMenuSeparator className="my-1" />}
          </div>
        ))}
        <DropdownMenuSeparator className="my-1" />
        <Button
          variant="default"
          className="w-full"
          onClick={() => {
            onChange(draft);
            setOpen(false);
          }}
        >
          {confirmLabel}
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
