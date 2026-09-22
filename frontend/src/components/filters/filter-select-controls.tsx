"use client";

import { Fragment, type ReactNode, useState } from "react";

import { Check, ChevronDown, ChevronUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface SelectOption {
  id?: string;
  value: string;
  label: string;
  icon?: ReactNode;
  section?: string;
  description?: ReactNode;
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
  closeLabel = "关闭",
  confirmLabel = "确认",
}: {
  value: Record<string, string[]>;
  groups: SelectConditionGroup[];
  title?: string;
  noneLabel?: string;
  onChange: (value: Record<string, string[]>) => void;
  align?: "start" | "center" | "end";
  clearLabel?: string;
  closeLabel?: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>(value);
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id ?? "");
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const allOptions = groups.flatMap((group) => group.options);
  const selectedValues = Object.values(value).flat();
  const selected = allOptions.filter((option) => selectedValues.includes(option.value));
  const isDefault = selectedValues.length === 0;
  const draftSelection = groups.flatMap((group) =>
    (draft[group.id] ?? [])
      .filter((item) => item !== "all")
      .map((item) => ({
        groupId: group.id,
        groupLabel: group.label,
        option: group.options.find((option) => option.value === item),
      }))
      .filter(
        (item): item is { groupId: string; groupLabel: string; option: SelectOption } => item.option !== undefined,
      ),
  );
  const summary =
    selected.length <= 2
      ? selected.map((option) => option.label).join("/")
      : `${selected[0].label}/${selected[1].label} 等${selected.length}项`;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(value);
          setActiveGroupId(groups[0]?.id ?? "");
        }
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
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="w-[640px] max-w-[calc(100vw-2rem)] overflow-hidden! rounded-lg p-0"
      >
        <div className="grid h-[min(420px,calc(100vh-12rem))] grid-cols-[140px_minmax(0,1fr)] sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="overflow-y-auto border-r bg-muted/20 p-3">
            <ToggleGroup
              type="single"
              orientation="vertical"
              value={activeGroupId}
              onValueChange={(next) => next && setActiveGroupId(next)}
              className="grid w-full gap-1"
            >
              {groups.map((group) => (
                <ToggleGroupItem
                  key={group.id}
                  value={group.id}
                  variant="outline"
                  className="min-h-10 w-full justify-start rounded-lg border px-3 text-left text-sm font-normal data-[state=on]:border-primary/35 data-[state=on]:bg-primary-soft data-[state=on]:font-semibold data-[state=on]:text-primary"
                >
                  {group.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="min-w-0 overflow-y-auto p-4">
            {activeGroup ? (
              activeGroup.mode === "single" ? (
                <RadioGroup
                  key={activeGroup.id}
                  value={draft[activeGroup.id]?.[0] ?? ""}
                  onValueChange={(next) => setDraft((prev) => ({ ...prev, [activeGroup.id]: [next] }))}
                  className="gap-1"
                >
                  {activeGroup.options.map((option, index) => {
                    const showSection =
                      Boolean(option.section) &&
                      index > 0 &&
                      activeGroup.options[index - 1]?.section !== option.section;
                    return (
                      <Fragment key={option.id ?? option.value}>
                        {showSection ? <div className="my-1 h-px bg-border" /> : null}
                        <label
                          htmlFor={`condition-${activeGroup.id}-${option.id ?? option.value}`}
                          className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-normal text-foreground hover:bg-accent"
                        >
                          <RadioGroupItem
                            id={`condition-${activeGroup.id}-${option.id ?? option.value}`}
                            value={option.value}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                            <span className="truncate">{option.label}</span>
                            {option.description ? (
                              <span className="min-w-0 text-xs text-muted-foreground">{option.description}</span>
                            ) : null}
                          </span>
                        </label>
                      </Fragment>
                    );
                  })}
                </RadioGroup>
              ) : (
                <div className="grid gap-1">
                  {activeGroup.options.map((option, index) => {
                    const groupValue = draft[activeGroup.id] ?? [];
                    const checked = groupValue.includes(option.value);
                    const showSection =
                      Boolean(option.section) &&
                      index > 0 &&
                      activeGroup.options[index - 1]?.section !== option.section;
                    return (
                      <Fragment key={option.id ?? option.value}>
                        {showSection ? <div className="my-1 h-px bg-border" /> : null}
                        <label
                          htmlFor={`condition-${activeGroup.id}-${option.id ?? option.value}`}
                          className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-normal text-foreground hover:bg-accent"
                        >
                          <Checkbox
                            id={`condition-${activeGroup.id}-${option.id ?? option.value}`}
                            checked={checked}
                            onCheckedChange={() =>
                              setDraft((prev) => {
                                const current = prev[activeGroup.id] ?? [];
                                return {
                                  ...prev,
                                  [activeGroup.id]: checked
                                    ? current.filter((item) => item !== option.value)
                                    : [...current, option.value],
                                };
                              })
                            }
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                            <span className="truncate">{option.label}</span>
                            {option.description ? (
                              <span className="min-w-0 text-xs text-muted-foreground">{option.description}</span>
                            ) : null}
                          </span>
                        </label>
                      </Fragment>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t p-4">
          <Button
            variant="ghost"
            className="shrink-0 px-0 text-primary hover:bg-transparent hover:text-primary-hover"
            onClick={() => setDraft({})}
          >
            {clearLabel}
          </Button>

          <div className="flex max-h-16 min-w-0 flex-1 flex-wrap items-center gap-1 overflow-y-auto">
            {draftSelection.map(({ groupId, groupLabel, option }) => (
              <Button
                key={`${groupId}-${option.value}`}
                type="button"
                variant="secondary"
                size="xs"
                className="max-w-40 gap-1"
                title={`${groupLabel}：${option.label}`}
                aria-label={`${groupLabel}：${option.label}`}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    [groupId]: (prev[groupId] ?? []).filter((item) => item !== option.value),
                  }))
                }
              >
                <span className="truncate">{`${groupLabel}：${option.label}`}</span>
                <X className="shrink-0 opacity-60" />
              </Button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {closeLabel}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
