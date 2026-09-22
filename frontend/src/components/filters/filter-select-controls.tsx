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
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";

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
      <InputGroup className={`h-8 max-w-44 ${className ?? ""}`}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={`h-full min-w-0 flex-1 justify-start gap-1.5 rounded-none border-0 px-2.5 shadow-none hover:bg-transparent aria-expanded:bg-transparent ${
              selected ? "font-semibold text-foreground" : "font-normal text-muted-foreground"
            }`}
          >
            {selected?.icon}
            <span className="min-w-0 flex-1 truncate text-left">{selected ? selected.label : placeholder}</span>
          </Button>
        </DropdownMenuTrigger>
        <InputGroupAddon align="inline-end" className="pl-0 pr-1">
          <InputGroupButton
            variant="ghost"
            size="icon-xs"
            aria-label={placeholder}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <DropdownMenuContent align={align} sideOffset={6} className="min-w-40 rounded-lg p-1">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              className={`cursor-pointer gap-2 rounded-md px-2 py-1.5 font-normal ${
                isSelected ? "bg-primary-soft text-foreground" : "text-foreground"
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
