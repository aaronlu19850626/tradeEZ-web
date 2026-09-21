import type { ReactNode } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

export function SyncEmptyState({
  title,
  description,
  actionLabel,
  href,
  onAction,
  actionIcon,
  embedded = false,
}: {
  title: string;
  description: string;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
  embedded?: boolean;
}) {
  const content = (
    <>
      <CardTitle className="text-base">{title}</CardTitle>
      <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
      {href ? (
        <Button asChild>
          <Link href={href}>
            {actionIcon}
            {actionLabel}
          </Link>
        </Button>
      ) : (
        <Button onClick={onAction}>
          {actionIcon}
          {actionLabel}
        </Button>
      )}
    </>
  );

  if (embedded) {
    return <div className="flex flex-col items-center gap-3 py-16 text-center">{content}</div>;
  }

  return <Card className="items-center gap-3 py-16 text-center">{content}</Card>;
}
