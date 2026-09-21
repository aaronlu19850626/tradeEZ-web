"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { InfoTip } from "@/components/shared/info-tip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/lib/i18n";
import { type DashboardText, fill } from "@/lib/tradesync/dashboard-i18n";
import type { CompositeScore, ScoreDimensionKey } from "@/lib/tradesync/trade-score";

import { CHART_RESIZE_DEBOUNCE, DIMENSION_LABEL, DIMENSION_TIP, LINE_COLOR } from "../../_lib/overview-data";
import { PanelFooter } from "./shared";

export function ScoreRadar({
  t,
  score,
  radar,
}: {
  t: DashboardText;
  locale: Locale;
  score: CompositeScore;
  radar: { key: ScoreDimensionKey; score: number }[];
}) {
  const data = radar.map((item) => ({ key: String(t[DIMENSION_LABEL[item.key]]), score: item.score }));
  if (score.insufficient) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="font-semibold text-lg text-muted-foreground">{t.scoreInsufficient}</p>
        <p className="text-xs text-muted-foreground">
          {fill(t.scoreInsufficientHint, { trades: score.sampleTrades, minTrades: 30, minR: 20 })}
        </p>
      </div>
    );
  }
  const total = score.total ?? 0;
  const markerLeft = Math.max(0, Math.min(100, total));

  return (
    <div className="flex h-full flex-col">
      <div className="h-[250px] w-full sm:h-[260px]">
        <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE}>
          <RadarChart data={data} outerRadius="82%" margin={{ top: 4, right: 42, bottom: 4, left: 42 }}>
            <PolarGrid gridType="polygon" stroke="var(--border)" />
            <PolarAngleAxis dataKey="key" tick={{ fontSize: 13, fill: "var(--muted-foreground)" }} tickLine={false} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              dataKey="score"
              stroke={LINE_COLOR}
              strokeWidth={1.6}
              fill={LINE_COLOR}
              fillOpacity={0.54}
              dot={{ r: 4, fill: "var(--card)", stroke: LINE_COLOR, strokeWidth: 2 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <PanelFooter>
        <div className="flex w-full items-center gap-5">
          <div className="flex min-w-[146px] items-baseline gap-2.5">
            <span className="text-muted-foreground text-xs">{t.scoreTotal}</span>
            <span className="font-medium text-3xl text-foreground/90 leading-none tabular-nums">
              {total.toFixed(1)}
            </span>
          </div>
          <div className="min-w-0 flex-1 border-l border-border/70 pl-5">
            <div className="relative h-2.5 rounded-full bg-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${markerLeft}%`,
                  background: "linear-gradient(90deg, var(--loss-strong) 0%, var(--warning) 52%, var(--chart-3) 100%)",
                }}
              />
              <span
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-warning shadow-sm"
                style={{ left: `${markerLeft}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
              {[0, 20, 40, 60, 80, 100].map((value) => (
                <span key={value}>{value}</span>
              ))}
            </div>
          </div>
        </div>
      </PanelFooter>
    </div>
  );
}

export function formatRaw(key: ScoreDimensionKey, raw: number): string {
  if (key === "consistency" || key === "winRate") return `${(raw * 100).toFixed(1)}%`;
  if (key === "recovery") return raw.toFixed(2);
  return `${raw}R`;
}

export function ScoreDialog({
  t,
  open,
  score,
  onClose,
}: {
  t: DashboardText;
  open: boolean;
  score: CompositeScore;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.scoreDetail}</DialogTitle>
          <DialogDescription>{t.scoreTip}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-bold">{t.scoreDetail}</TableHead>
                <TableHead className="text-right font-bold">{t.rawValue}</TableHead>
                <TableHead className="text-right font-bold">{t.weight}</TableHead>
                <TableHead className="text-right font-bold">{t.weighted}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {score.dimensions.map((dimension) => (
                <TableRow key={dimension.key} className="border-b border-border">
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {String(t[DIMENSION_LABEL[dimension.key]])}
                      <InfoTip
                        label={String(t[DIMENSION_LABEL[dimension.key]])}
                        text={String(t[DIMENSION_TIP[dimension.key]])}
                      />
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {dimension.raw === null ? t.na : formatRaw(dimension.key, dimension.raw)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Math.round(dimension.weight * 100)}%</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(dimension.score * dimension.weight).toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.scoreClose}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
