"use client";

import { type ReactNode, useState } from "react";

import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
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
          <ChevronDown className="size-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={6} className="min-w-44 space-y-0.5 rounded-lg p-1">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              className={`cursor-pointer gap-2 rounded-md px-2 py-2.5 text-sm leading-normal font-normal ${
                isSelected ? "bg-accent text-accent-foreground" : "text-foreground"
              }`}
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
