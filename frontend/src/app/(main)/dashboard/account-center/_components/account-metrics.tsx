"use client";

import { InfoTip } from "@/components/shared/info-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Metric({ title, tip, value, suffix }: { title: string; tip: string; value: string; suffix: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <span>{title}</span>
          <InfoTip label={title} text={tip} />
        </CardTitle>
      </CardHeader>
      <CardContent className="metric-value font-semibold">
        {value}
        <span className="ml-2 text-sm font-normal text-muted-foreground">{suffix}</span>
      </CardContent>
    </Card>
  );
}
