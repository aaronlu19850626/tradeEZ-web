import { Badge } from "@/components/ui/badge";

export function SymbolBadge({ value }: { value: string }) {
  return (
    <Badge variant="secondary" className="font-mono text-xs font-semibold">
      {value}
    </Badge>
  );
}
