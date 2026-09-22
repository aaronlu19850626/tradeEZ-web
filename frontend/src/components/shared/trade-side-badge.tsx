import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { TradeSide } from "@/lib/tradesync/trades-mock";

export function TradeSideBadge({
  side,
  buyLabel,
  sellLabel,
}: {
  side: TradeSide;
  buyLabel: string;
  sellLabel: string;
}) {
  const isBuy = side === "buy";
  const Icon = isBuy ? TrendingUp : TrendingDown;
  return (
    <Badge variant="outline" className="gap-1 text-foreground">
      <Icon className="size-3" />
      {isBuy ? buyLabel : sellLabel}
    </Badge>
  );
}
