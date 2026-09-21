"use client";

import type { ComponentProps } from "react";

import { cn } from "cn";

import { DialogContent as DialogContentPrimitive } from "@/components/ui/dialog";

type DialogContentProps = ComponentProps<typeof DialogContentPrimitive>;

export function DialogContent({ className, onOpenAutoFocus, tabIndex = -1, ...props }: DialogContentProps) {
  return (
    <DialogContentPrimitive
      tabIndex={tabIndex}
      className={cn("max-h-[calc(100dvh-2rem)] overflow-hidden", className)}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        if (event.defaultPrevented) return;

        event.preventDefault();
        if (event.target instanceof HTMLElement) event.target.focus();
      }}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("-mx-4 max-h-[50vh] min-h-0 overflow-y-auto overscroll-contain px-4", className)}
      {...props}
    />
  );
}
