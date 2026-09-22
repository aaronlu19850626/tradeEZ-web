"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import type { Locale } from "@/lib/i18n";

import { CHART_Y_AXIS_WIDTH, money, moneyAxis, tone } from "../../_lib/overview-data";

export interface PerformancePoint {
  x: number;
  y: number;
  label: string;
}

export function beijingHour(epoch: number): number {
  const daySeconds = 86_400;
  const seconds = (((epoch + 8 * 3600) % daySeconds) + daySeconds) % daySeconds;
  return seconds / 3600;
}

export function formatDurationAxis(value: number): string {
  if (value < 1) return `${Math.round(value * 1000)}ms`;
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) {
    return `${Math.floor(value / 60)}m:${String(Math.round(value % 60)).padStart(2, "0")}s`;
  }
  if (value < 86_400) {
    return `${Math.floor(value / 3600)}h:${String(Math.floor((value % 3600) / 60)).padStart(2, "0")}m`;
  }
  return `${Math.floor(value / 86_400)}d:${Math.floor((value % 86_400) / 3600)}h`;
}

export function durationTicks(min: number, max: number): number[] {
  const safeMin = Math.max(0.1, min);
  const safeMax = Math.max(safeMin * 1.01, max);
  const logMin = Math.log10(safeMin);
  const logMax = Math.log10(safeMax);
  return Array.from({ length: 10 }, (_, index) => 10 ** (logMin + ((logMax - logMin) * index) / 9));
}

export function niceAxis(minValue: number, maxValue: number): { min: number; max: number; ticks: number[] } {
  const min = Math.min(0, minValue);
  const max = Math.max(0, maxValue);
  const span = max - min || 1;
  const paddedMin = min - span * 0.08;
  const paddedMax = max + span * 0.08;
  const roughStep = (paddedMax - paddedMin) / 8;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1)));
  const residual = roughStep / magnitude;
  const factor = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  const step = factor * magnitude;
  const niceMin = Math.floor(paddedMin / step) * step;
  const niceMax = Math.ceil(paddedMax / step) * step;
  const ticks: number[] = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return { min: niceMin, max: niceMax, ticks };
}

export function cssColor(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

export function PerformanceScatterChart({
  data,
  ticks,
  tickFormatter,
  domain,
  useLogScale = false,
  locale,
}: {
  data: PerformancePoint[];
  ticks: number[];
  tickFormatter: (value: number) => string;
  domain: [number, number];
  useLogScale?: boolean;
  locale: Locale;
}) {
  const currency = useDisplayCurrency();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const plottedRef = useRef<{ point: PerformancePoint; x: number; y: number }[]>([]);
  const [size, setSize] = useState({ width: 0, height: 290 });
  const [tooltip, setTooltip] = useState<{ point: PerformancePoint; left: number; top: number } | null>(null);
  const yAxis = useMemo(
    () => niceAxis(Math.min(...data.map((point) => point.y), 0), Math.max(...data.map((point) => point.y), 0)),
    [data],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: Math.round(entry.contentRect.width), height: 290 });
    });
    observer.observe(host);
    setSize({ width: Math.round(host.getBoundingClientRect().width), height: 290 });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host || size.width <= 0) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = size.width;
      const height = size.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const padding = { top: 10, right: 12, bottom: 60, left: CHART_Y_AXIS_WIDTH };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      if (plotWidth <= 0 || plotHeight <= 0) return;

      const [domainMin, domainMax] = domain;
      const xPosition = (value: number) => {
        if (useLogScale) {
          const logMin = Math.log10(Math.max(domainMin, 0.1));
          const logMax = Math.log10(Math.max(domainMax, domainMin * 1.001, 0.11));
          return padding.left + ((Math.log10(Math.max(value, 0.1)) - logMin) / (logMax - logMin)) * plotWidth;
        }
        return padding.left + ((value - domainMin) / (domainMax - domainMin || 1)) * plotWidth;
      };
      const yPosition = (value: number) =>
        padding.top + ((yAxis.max - value) / (yAxis.max - yAxis.min || 1)) * plotHeight;

      const foreground = cssColor("--muted-foreground") || "currentColor";
      const border = cssColor("--border") || "currentColor";
      const card = cssColor("--card") || "transparent";
      const success = cssColor("--profit-strong") || "currentColor";
      const successBorder = cssColor("--profit") || "currentColor";
      const loss = cssColor("--loss-strong") || "currentColor";
      const lossBorder = cssColor("--loss") || "currentColor";

      ctx.font = "11px Geist, sans-serif";
      ctx.fillStyle = foreground;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";

      for (const tick of yAxis.ticks) {
        const y = yPosition(tick);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillText(moneyAxis(tick, locale, currency), padding.left - 6, y);
      }

      const zeroY = yPosition(0);
      ctx.beginPath();
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(width - padding.right, zeroY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(0, padding.top + plotHeight + 12);
      for (const tick of ticks) {
        const x = xPosition(tick);
        if (x < padding.left - 1 || x > width - padding.right + 1) continue;
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = foreground;
        ctx.fillText(tickFormatter(tick), 0, 0);
        ctx.restore();
      }
      ctx.restore();

      const plotted: { point: PerformancePoint; x: number; y: number }[] = [];
      for (const point of data) {
        const x = xPosition(point.x);
        const y = yPosition(point.y);
        if (x < padding.left || x > width - padding.right || y < padding.top || y > padding.top + plotHeight) continue;
        const positive = point.y >= 0;
        ctx.beginPath();
        ctx.arc(x, y, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = positive ? success : loss;
        ctx.strokeStyle = positive ? successBorder : lossBorder;
        ctx.lineWidth = 0.5;
        ctx.fill();
        ctx.stroke();
        plotted.push({ point, x, y });
      }
      plottedRef.current = plotted;
      ctx.fillStyle = card;
    };

    draw();
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-market-profile"],
    });
    return () => themeObserver.disconnect();
  }, [currency, data, domain, locale, size, tickFormatter, ticks, useLogScale, yAxis]);

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    frameRef.current = requestAnimationFrame(() => {
      let nearest: { point: PerformancePoint; distance: number; x: number; y: number } | null = null;
      for (const item of plottedRef.current) {
        const distance = (item.x - x) ** 2 + (item.y - y) ** 2;
        if (distance <= 64 && (!nearest || distance < nearest.distance)) {
          nearest = { ...item, distance };
        }
      }
      setTooltip(nearest ? { point: nearest.point, left: nearest.x, top: nearest.y } : null);
    });
  };

  return (
    <div ref={hostRef} className="relative h-[290px] w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border/70 bg-card px-3 py-2 shadow-[0_10px_28px_rgb(32_20_61_/_12%)]"
          style={{ left: tooltip.left, top: tooltip.top - 10 }}
        >
          <div className="text-muted-foreground text-xs">{tooltip.point.label}</div>
          <div className={`mt-1 font-semibold text-sm tabular-nums ${tone(tooltip.point.y)}`}>
            {money(tooltip.point.y, locale, currency)}
          </div>
        </div>
      )}
    </div>
  );
}
