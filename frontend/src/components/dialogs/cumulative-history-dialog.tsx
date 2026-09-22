"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  BaselineSeries,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { useMarketColorProfile } from "@/components/shared/market-color-provider";
import { useDisplayCurrency } from "@/components/shared/display-currency-provider";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format-numbers";
import type { Locale } from "@/lib/i18n";
import { MARKET_COLOR_FALLBACKS, readMarketColor } from "@/lib/market-colors";

const LINE_LIGHT = "#6b4fc4";
const LINE_DARK = "#8b6de8";
const GRID_LIGHT = "#e3dfed";
const GRID_DARK = "#352e46";
const TEXT_LIGHT = "#6f6a7d";
const TEXT_DARK = "#aaa4ba";

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3 ? normalized.replace(/(.)/g, "$1$1") : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  if (![red, green, blue].every(Number.isFinite)) return hex;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export interface CumulativeHistoryPoint {
  date: string;
  value: number;
}

export function CumulativeHistoryDialog({
  open,
  onOpenChange,
  points,
  title,
  description,
  loadingText,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  points: CumulativeHistoryPoint[];
  title: string;
  description: string;
  loadingText: string;
  locale: Locale;
}) {
  const marketProfile = useMarketColorProfile();
  const currency = useDisplayCurrency();
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const [ready, setReady] = useState(false);
  const data = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const point of points) byDate.set(point.date, point.value);
    return [...byDate.entries()]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([time, value]) => ({ time: time as Time, value }));
  }, [points]);

  useEffect(() => {
    if (!open) return;
    const host = hostRef.current;
    if (!host || data.length === 0) return;

    setReady(false);
    let chart: IChartApi | null = null;
    const frame = requestAnimationFrame(() => {
      const dark = document.documentElement.classList.contains("dark");
      const fallback = marketProfile === "cn" ? MARKET_COLOR_FALLBACKS.cn : MARKET_COLOR_FALLBACKS.fx;
      const profit = readMarketColor("--profit-strong", fallback.profitStrong);
      const loss = readMarketColor("--loss-strong", fallback.lossStrong);
      const line = dark ? LINE_DARK : LINE_LIGHT;
      const grid = dark ? GRID_DARK : GRID_LIGHT;
      const text = dark ? TEXT_DARK : TEXT_LIGHT;
      chart = createChart(host, {
        autoSize: true,
        layout: {
          background: { color: "transparent" },
          textColor: text,
          attributionLogo: false,
        },
        localization: {
          priceFormatter: (value: number) => formatMoney(value, locale, currency),
        },
        grid: {
          vertLines: { color: grid },
          horzLines: { color: grid },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
        timeScale: {
          borderVisible: false,
          timeVisible: false,
          secondsVisible: false,
          rightOffset: 6,
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: line, width: 1, style: 2, labelBackgroundColor: line },
          horzLine: { color: line, width: 1, style: 2, labelBackgroundColor: line },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      chartRef.current = chart;
      seriesRef.current = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: 0 },
        topLineColor: line,
        topFillColor1: withAlpha(profit, 0.28),
        topFillColor2: withAlpha(profit, 0.04),
        bottomLineColor: line,
        bottomFillColor1: withAlpha(loss, 0.04),
        bottomFillColor2: withAlpha(loss, 0.32),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      seriesRef.current.setData(data);

      if (data.length > 120) {
        chart.timeScale().setVisibleLogicalRange({ from: data.length - 120, to: data.length + 2 });
      } else {
        chart.timeScale().fitContent();
      }
      setReady(true);
    });

    return () => {
      cancelAnimationFrame(frame);
      chart?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [currency, data, locale, marketProfile, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-[96vw]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[72vh] overflow-hidden">
          <div className="relative h-[70vh] min-h-[420px] w-full">
            <div ref={hostRef} className="h-full w-full" />
            {!ready && (
              <div className="absolute inset-0 grid place-items-center bg-popover">
                <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex h-10 items-center gap-1.5" aria-hidden>
                    {[0, 1, 2, 3].map((index) => (
                      <span
                        key={index}
                        className="tradeez-loading-bar h-10 w-2 rounded-full bg-primary"
                        style={{ animationDelay: `${(-index * 1.45) / 4}s` }}
                      />
                    ))}
                  </div>
                  <span>{loadingText}</span>
                </div>
              </div>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
