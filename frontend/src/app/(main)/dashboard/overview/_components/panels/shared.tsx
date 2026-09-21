"use client";

import type { ReactNode } from "react";

import { InfoTip } from "@/components/shared/info-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n";
import type { DashboardText } from "@/lib/tradesync/dashboard-i18n";

import {
  LOSS_SOLID,
  money,
  PANEL_BODY_CLASS,
  PANEL_FOOTER_CLASS,
  PANEL_HEADER_CLASS,
  PANEL_SHELL_CLASS,
  PANEL_TITLE_CLASS,
  PROFIT_SOLID,
} from "../../_lib/overview-data";

export function Panel({
  t,
  titleKey,
  tipKey,
  action,
  className,
  titleClassName,
  headerClassName,
  bodyClassName,
  children,
}: {
  t: DashboardText;
  titleKey: keyof DashboardText;
  tipKey: keyof DashboardText;
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`gap-0 pt-4 pb-4 ${PANEL_SHELL_CLASS} ${className ?? ""}`}>
      <CardHeader
        className={`flex flex-row items-center justify-between py-0 ${PANEL_HEADER_CLASS} ${headerClassName ?? ""}`}
      >
        <span className="flex items-center gap-1.5">
          <CardTitle className={titleClassName ?? PANEL_TITLE_CLASS}>{String(t[titleKey])}</CardTitle>
          <InfoTip label={String(t[titleKey])} text={String(t[tipKey])} />
        </span>
        {action}
      </CardHeader>
      <CardContent className={`${PANEL_BODY_CLASS} ${bodyClassName ?? ""}`}>{children}</CardContent>
    </Card>
  );
}

export function PanelFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${PANEL_FOOTER_CLASS} ${className ?? ""}`}>{children}</div>;
}

/**
 * Overview metric tile: label + tooltip (+ optional count badge) on top, then a
 * row with the headline value on the left and the visual on the right. Mirrors
 * the approved tracking reference layout.
 */
export function MetricTile({
  t,
  titleKey,
  tipKey,
  badge,
  value,
  visual,
}: {
  t: DashboardText;
  titleKey: keyof DashboardText;
  tipKey: keyof DashboardText;
  badge?: number;
  value: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <Card className="h-full gap-1.5 pt-5 pb-3">
      <CardHeader className="flex flex-row items-center gap-1.5 px-4 py-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <CardTitle className="truncate font-medium text-[13px] text-muted-foreground leading-none">
            {String(t[titleKey])}
          </CardTitle>
          <InfoTip label={String(t[titleKey])} text={String(t[tipKey])} />
        </span>
        {badge === undefined ? null : (
          <span
            className="rounded-full bg-muted px-1.5 py-0.5 font-semibold text-[12px] text-foreground leading-4 tabular-nums"
            title={`${String(t.totalTrades)} ${badge}`}
          >
            {badge}
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 items-center justify-between gap-2 px-4">
        <div className="font-semibold text-2xl leading-none tabular-nums">{value}</div>
        {visual}
      </CardContent>
    </Card>
  );
}

export function polar(cx: number, cy: number, radius: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
}

/** Degrees are math-style: 0 = right, 90 = up, 180 = left. Larger → smaller draws clockwise. */
export function arcPath(cx: number, cy: number, radius: number, fromDeg: number, toDeg: number): string {
  const start = polar(cx, cy, radius, fromDeg);
  const end = polar(cx, cy, radius, toDeg);
  const largeArc = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
  const sweep = fromDeg > toDeg ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

/** Semicircle gauge: profit share fills from the left end over the top. */
export function SemiGauge({ ratio }: { ratio: number }) {
  const share = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const split = 180 - share * 180;
  return (
    <svg viewBox="0 0 100 56" className="h-[52px] w-[96px]" aria-hidden role="presentation">
      {share > 0 ? (
        <path
          d={arcPath(50, 50, 44, 180, split)}
          fill="none"
          stroke={PROFIT_SOLID}
          strokeWidth={8}
          strokeLinecap="round"
        />
      ) : null}
      {share < 1 ? (
        <path d={arcPath(50, 50, 44, split, 0)} fill="none" stroke={LOSS_SOLID} strokeWidth={8} strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/** Full ring: profit share starts at 3 o'clock and runs counter-clockwise. */
export function ShareRing({ ratio }: { ratio: number }) {
  const share = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const split = share * 360;
  return (
    <svg viewBox="0 0 64 64" className="h-[62px] w-[62px]" aria-hidden role="presentation">
      {share > 0 ? (
        <path
          d={arcPath(32, 32, 27, split, 0)}
          fill="none"
          stroke={PROFIT_SOLID}
          strokeWidth={6}
          strokeLinecap="round"
        />
      ) : null}
      {share < 1 ? (
        <path
          d={arcPath(32, 32, 27, 0, split - 360)}
          fill="none"
          stroke={LOSS_SOLID}
          strokeWidth={6}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

export function CountPills({
  t,
  winners,
  breakEven,
  losers,
}: {
  t: DashboardText;
  winners: number;
  breakEven: number;
  losers: number;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-1">
      <span
        className="rounded-full bg-profit-soft px-1.5 py-0.5 font-semibold text-[11px] text-profit-strong leading-3.5 tabular-nums"
        title={`${t.winners} ${winners}`}
      >
        {winners}
      </span>
      <span
        className="rounded-full bg-breakeven-soft px-1.5 py-0.5 font-semibold text-[11px] text-breakeven leading-3.5 tabular-nums"
        title={`${t.breakEven} ${breakEven}`}
      >
        {breakEven}
      </span>
      <span
        className="rounded-full bg-loss-soft px-1.5 py-0.5 font-semibold text-[11px] text-loss-strong leading-3.5 tabular-nums"
        title={`${t.losers} ${losers}`}
      >
        {losers}
      </span>
    </div>
  );
}

export function AvgWinLossBar({ win, loss, locale }: { win: number; loss: number; locale: Locale }) {
  const total = win + loss;
  const winRatio = total === 0 ? 0.5 : win / total;
  return (
    <div className="flex w-full flex-1 flex-col gap-1.5">
      <div className="flex h-2.5 overflow-hidden rounded-full">
        <span style={{ width: `${winRatio * 100}%`, background: PROFIT_SOLID }} />
        <span className="flex-1" style={{ background: LOSS_SOLID }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="font-medium text-profit-strong tabular-nums">{money(win, locale)}</span>
        <span className="font-medium text-loss-strong tabular-nums">{money(-loss, locale)}</span>
      </div>
    </div>
  );
}
