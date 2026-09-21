"use client";

import { forwardRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

const panelActionClass = "px-3 font-semibold text-primary hover:text-primary";
const panelIconActionClass =
  "text-primary hover:text-primary";

export function PanelAction({ children, href, onClick }: { children: ReactNode; href?: string; onClick?: () => void }) {
  if (href) {
    return (
      <Button asChild variant="ghost" className={panelActionClass}>
        <a href={href}>{children}</a>
      </Button>
    );
  }
  return (
    <Button type="button" variant="ghost" className={panelActionClass} onClick={onClick}>
      {children}
    </Button>
  );
}

export function OutlineAction({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <Button type="button" variant="outline" size="sm" title={title} onClick={onClick}>
      {children}
    </Button>
  );
}

export function PanelIconAction({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={panelIconActionClass}
    >
      {children}
    </Button>
  );
}

export const PanelMenuTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { label: string }
>(function PanelMenuTrigger({ children, label, className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      {...props}
      className={`${panelIconActionClass} ${className ?? ""}`}
    >
      {children}
    </Button>
  );
});
