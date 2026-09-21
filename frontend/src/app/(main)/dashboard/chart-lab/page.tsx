"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  type CandlestickData,
  CandlestickSeries,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  HistogramSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ITextWatermarkPluginApi,
  type LineData,
  LineSeries,
  PriceScaleMode,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { Camera, Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { bollinger, buildLabBars, type LabBar, macd, rsi, sma, toLine } from "@/lib/chart-lab/data";
import { type ChartLabText, chartLabText } from "@/lib/chart-lab/i18n";
import { HighlightWindowPrimitive } from "@/lib/chart-lab/primitives";
import { useLocale } from "@/lib/i18n";

const PROFIT = "#4ebf94";
const LOSS = "#f06363";
const ACCENT = "#6b5aa8";
const GRID = "#eceaf4";
const DATA_SIZES = [2000, 10000, 50000];

type SeriesKind = "Candlestick" | "Bar" | "Line" | "Area" | "Baseline";

const SERIES_DEFS = {
  Candlestick: CandlestickSeries,
  Bar: BarSeries,
  Line: LineSeries,
  Area: AreaSeries,
  Baseline: BaselineSeries,
} as const;

interface FeatureState {
  ma20: boolean;
  ma50: boolean;
  bollinger: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
  markers: boolean;
  priceLines: boolean;
  customPrimitive: boolean;
  crosshairLegend: boolean;
  watermark: boolean;
}

const DEFAULT_FEATURES: FeatureState = {
  ma20: true,
  ma50: true,
  bollinger: true,
  volume: true,
  rsi: true,
  macd: true,
  markers: true,
  priceLines: true,
  customPrimitive: true,
  crosshairLegend: true,
  watermark: true,
};

interface LegendState {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma20: number | null;
  ma50: number | null;
  rsi: number | null;
  macd: number | null;
}

function mainOptions(kind: SeriesKind) {
  if (kind === "Line" || kind === "Area") {
    return {
      lineColor: ACCENT,
      lineWidth: 2 as const,
      topColor: "rgba(78,191,148,0.35)",
      bottomColor: "rgba(78,191,148,0.02)",
      priceLineVisible: false,
    };
  }
  if (kind === "Baseline") {
    return {
      baseValue: { type: "price" as const, price: 4400 },
      topLineColor: PROFIT,
      topFillColor1: "rgba(78,191,148,0.30)",
      topFillColor2: "rgba(78,191,148,0.02)",
      bottomLineColor: LOSS,
      bottomFillColor1: "rgba(240,99,99,0.02)",
      bottomFillColor2: "rgba(240,99,99,0.30)",
      priceLineVisible: false,
    };
  }
  return {
    upColor: PROFIT,
    downColor: LOSS,
    borderVisible: false,
    wickUpColor: PROFIT,
    wickDownColor: LOSS,
    priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 },
  };
}

export default function ChartLabPage() {
  const locale = useLocale();
  const t = chartLabText[locale];

  const [size, setSize] = useState(DATA_SIZES[0]);
  const [kind, setKind] = useState<SeriesKind>("Candlestick");
  const [features, setFeatures] = useState<FeatureState>(DEFAULT_FEATURES);
  const [logScale, setLogScale] = useState(false);
  const [invertScale, setInvertScale] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [secondsVisible, setSecondsVisible] = useState(false);
  const [shanghaiTime, setShanghaiTime] = useState(true);
  const [magnet, setMagnet] = useState(true);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [legend, setLegend] = useState<LegendState | null>(null);
  const [mainSeries, setMainSeries] = useState<ISeriesApi<SeriesType> | null>(null);

  const bars = useMemo(() => buildLabBars(size), [size]);
  const indexByTime = useMemo(() => {
    const map = new Map<number, number>();
    bars.forEach((bar, index) => {
      map.set(bar.time, index);
    });
    return map;
  }, [bars]);

  const closes = useMemo(() => bars.map((bar) => bar.close), [bars]);
  const ma20 = useMemo(() => sma(closes, 20), [closes]);
  const ma50 = useMemo(() => sma(closes, 50), [closes]);
  const bands = useMemo(() => bollinger(closes, 20, 2), [closes]);
  const rsiSeries = useMemo(() => rsi(closes, 14), [closes]);
  const macdSeries = useMemo(() => macd(closes), [closes]);
  const trades = useMemo(() => buildTrades(bars), [bars]);

  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const mainKindRef = useRef<SeriesKind | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
  const primitiveRef = useRef<HighlightWindowPrimitive | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const overlayRef = useRef<Record<string, ISeriesApi<SeriesType> | null>>({});

  // Build the chart, its four panes and every overlay series once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#6b7280",
        attributionLogo: false,
        panes: { separatorColor: GRID, separatorHoverColor: ACCENT },
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Magnet },
    });
    chartRef.current = chart;
    chart.addPane(); // volume
    chart.addPane(); // rsi
    chart.addPane(); // macd

    overlayRef.current = {
      ma20: chart.addSeries(
        LineSeries,
        { color: "#f0b429", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        0,
      ),
      ma50: chart.addSeries(
        LineSeries,
        { color: "#3f8cff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        0,
      ),
      bbUpper: chart.addSeries(
        LineSeries,
        { color: "rgba(107,90,168,0.55)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        0,
      ),
      bbMiddle: chart.addSeries(
        LineSeries,
        { color: "rgba(107,90,168,0.9)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false },
        0,
      ),
      bbLower: chart.addSeries(
        LineSeries,
        { color: "rgba(107,90,168,0.55)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        0,
      ),
      volume: chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
        1,
      ),
      rsi: chart.addSeries(
        LineSeries,
        { color: ACCENT, lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        2,
      ),
      macd: chart.addSeries(
        LineSeries,
        { color: "#3f8cff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        3,
      ),
      signal: chart.addSeries(
        LineSeries,
        { color: "#f0b429", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        3,
      ),
      histogram: chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 3),
    };
    const rsiApi = overlayRef.current.rsi;
    if (rsiApi) {
      rsiApi.createPriceLine({
        price: 70,
        color: "rgba(240,99,99,0.6)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "70",
      });
      rsiApi.createPriceLine({
        price: 30,
        color: "rgba(78,191,148,0.6)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "30",
      });
    }
    return () => {
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      mainKindRef.current = null;
      markersRef.current = null;
      watermarkRef.current = null;
      primitiveRef.current = null;
      priceLinesRef.current = [];
      overlayRef.current = {};
    };
  }, []);

  // Main series follows the selected type; overlay data follows the feature flags.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const started = performance.now();
    if (!mainRef.current || mainKindRef.current !== kind) {
      if (mainRef.current) chart.removeSeries(mainRef.current);
      mainRef.current = chart.addSeries(SERIES_DEFS[kind], mainOptions(kind), 0);
      mainKindRef.current = kind;
      setMainSeries(mainRef.current);
    }
    const main = mainRef.current;
    const overlay = overlayRef.current;
    const lineData = (points: (number | null)[]) =>
      toLine(points, bars).map((point) => ({ time: point.time as UTCTimestamp, value: point.value }));

    main.setData(
      kind === "Line" || kind === "Area" || kind === "Baseline"
        ? bars.map((bar) => ({ time: bar.time as UTCTimestamp, value: bar.close }))
        : bars.map((bar) => ({
            time: bar.time as UTCTimestamp,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          })),
    );
    overlay.ma20?.setData(features.ma20 ? lineData(ma20) : []);
    overlay.ma50?.setData(features.ma50 ? lineData(ma50) : []);
    overlay.bbUpper?.setData(features.bollinger ? lineData(bands.upper) : []);
    overlay.bbMiddle?.setData(features.bollinger ? lineData(bands.middle) : []);
    overlay.bbLower?.setData(features.bollinger ? lineData(bands.lower) : []);
    overlay.volume?.setData(
      features.volume
        ? bars.map((bar) => ({
            time: bar.time as UTCTimestamp,
            value: bar.volume,
            color: bar.close >= bar.open ? "rgba(78,191,148,0.45)" : "rgba(240,99,99,0.45)",
          }))
        : [],
    );
    overlay.rsi?.setData(features.rsi ? lineData(rsiSeries) : []);
    overlay.macd?.setData(features.macd ? lineData(macdSeries.macd) : []);
    overlay.signal?.setData(features.macd ? lineData(macdSeries.signal) : []);
    overlay.histogram?.setData(
      features.macd
        ? toLine(macdSeries.histogram, bars).map((point) => ({
            time: point.time as UTCTimestamp,
            value: point.value,
            color: point.value >= 0 ? "rgba(78,191,148,0.55)" : "rgba(240,99,99,0.55)",
          }))
        : [],
    );
    chart.timeScale().fitContent();
    setRenderMs(Math.round((performance.now() - started) * 10) / 10);
  }, [bars, bands, kind, ma20, ma50, macdSeries, features, rsiSeries]);

  // Trade markers for the marked strategies.
  useEffect(() => {
    const main = mainSeries;
    if (!main) return;
    if (!markersRef.current) markersRef.current = createSeriesMarkers(main, []);
    const list: SeriesMarker<Time>[] = features.markers
      ? trades.flatMap((trade) => [
          {
            time: trade.entryTime as UTCTimestamp,
            position: trade.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
            color: trade.side === "buy" ? PROFIT : LOSS,
            shape: trade.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
            text: `${trade.side === "buy" ? "B" : "S"} ${trade.volume}`,
          },
          {
            time: trade.exitTime as UTCTimestamp,
            position: "aboveBar" as const,
            color: trade.pnl >= 0 ? PROFIT : LOSS,
            shape: "circle" as const,
            text: `${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(1)}`,
          },
        ])
      : [];
    list.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current.setMarkers(list);
  }, [features.markers, mainSeries, trades]);

  // Price lines: entry, stop, target and the latest price.
  useEffect(() => {
    const main = mainSeries;
    if (!main) return;
    for (const line of priceLinesRef.current) main.removePriceLine(line);
    priceLinesRef.current = [];
    if (features.priceLines && trades.length > 0) {
      const trade = trades[trades.length - 1];
      const last = bars[bars.length - 1].close;
      priceLinesRef.current = [
        main.createPriceLine({
          price: trade.entryPrice,
          color: ACCENT,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "Entry",
        }),
        main.createPriceLine({
          price: trade.stopPrice,
          color: LOSS,
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: "SL",
        }),
        main.createPriceLine({
          price: trade.targetPrice,
          color: PROFIT,
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: "TP",
        }),
        main.createPriceLine({
          price: last,
          color: "#111827",
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: true,
          title: "Last",
        }),
      ];
    }
  }, [bars, features.priceLines, mainSeries, trades]);

  // Custom drawing plugin (pane primitive) and the official watermark plugin.
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainSeries;
    if (!chart || !main) return;
    if (primitiveRef.current) main.detachPrimitive(primitiveRef.current);
    primitiveRef.current = null;
    if (features.customPrimitive && trades.length > 0) {
      const trade = trades[0];
      primitiveRef.current = new HighlightWindowPrimitive(chart, main, {
        from: trade.entryTime as UTCTimestamp,
        to: trade.exitTime as UTCTimestamp,
        level: trade.entryPrice,
        fill: "rgba(107,90,168,0.10)",
        line: "rgba(107,90,168,0.65)",
        label: "trade",
      });
      main.attachPrimitive(primitiveRef.current);
    }
  }, [features.customPrimitive, mainSeries, trades]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    watermarkRef.current?.detach();
    watermarkRef.current = null;
    if (features.watermark) {
      watermarkRef.current = createTextWatermark(chart.panes()[0], {
        horzAlign: "center",
        vertAlign: "center",
        lines: [{ text: "TradeEZ", color: "rgba(107,90,168,0.10)", fontSize: 54 }],
      });
    }
  }, [features.watermark]);

  // Scales, time formatting and crosshair mode.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      invertScale,
      autoScale,
    });
    chart.applyOptions({
      timeScale: { secondsVisible },
      crosshair: { mode: magnet ? CrosshairMode.Magnet : CrosshairMode.Normal },
      localization: {
        locale,
        timeFormatter: (time: Time) =>
          new Intl.DateTimeFormat(locale, {
            timeZone: shanghaiTime ? "Asia/Shanghai" : "UTC",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: secondsVisible ? "2-digit" : undefined,
            hour12: false,
          }).format(new Date((time as number) * 1000)),
      },
    });
  }, [autoScale, invertScale, locale, logScale, magnet, secondsVisible, shanghaiTime]);

  // Legend follows the crosshair.
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainSeries;
    if (!chart || !main) return;
    if (!features.crosshairLegend) {
      setLegend(null);
      return;
    }
    const handler = (param: { time?: Time; seriesData: Map<ISeriesApi<SeriesType>, unknown> }) => {
      const time = param.time as number | undefined;
      if (typeof time !== "number") {
        setLegend(null);
        return;
      }
      const data = param.seriesData.get(main) as CandlestickData<Time> | LineData<Time> | undefined;
      const index = indexByTime.get(time);
      if (index === undefined) return;
      const bar = bars[index];
      setLegend({
        time: bar.time,
        open: (data && "open" in data ? Number(data.open) : bar.open) ?? bar.open,
        high: (data && "high" in data ? Number(data.high) : bar.high) ?? bar.high,
        low: (data && "low" in data ? Number(data.low) : bar.low) ?? bar.low,
        close: (data && "close" in data ? Number(data.close) : bar.close) ?? bar.close,
        volume: bar.volume,
        ma20: ma20[index],
        ma50: ma50[index],
        rsi: rsiSeries[index],
        macd: macdSeries.macd[index],
      });
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [bars, features.crosshairLegend, indexByTime, ma20, ma50, macdSeries, mainSeries, rsiSeries]);

  const exportPng = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const canvas = chart.takeScreenshot(true, true);
    const link = document.createElement("a");
    link.download = "tradeez-chart.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const toggle = (key: keyof FeatureState) => (next: boolean) => setFeatures((prev) => ({ ...prev, [key]: next }));

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[620px] min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-3xl tracking-tight">{t.title}</h1>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {t.demoBadge}
          </Badge>
          <span className="text-muted-foreground text-sm">XAUUSD · 5m</span>
        </div>
        <span className="flex items-center gap-2 text-muted-foreground text-xs">
          {t.renderTime} {renderMs ?? "—"} ms · {bars.length} {t.barsUnit}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        <Card className="flex w-[268px] shrink-0 flex-col gap-0 pt-4 pb-3">
          <CardHeader className="py-0">
            <CardTitle className="text-sm">{t.features}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-3 pr-1">
            <Group title={t.groupSeries}>
              <Row label={t.mainSeries}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 px-2 font-normal text-xs">
                      {t[`type${kind}` as keyof ChartLabText]}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(["Candlestick", "Bar", "Line", "Area", "Baseline"] as SeriesKind[]).map((item) => (
                      <DropdownMenuItem key={item} onSelect={() => setKind(item)}>
                        {t[`type${item}` as keyof ChartLabText]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Row>
              <SwitchLine label={t.ma20} checked={features.ma20} onChange={toggle("ma20")} />
              <SwitchLine label={t.ma50} checked={features.ma50} onChange={toggle("ma50")} />
              <SwitchLine label={t.bollinger} checked={features.bollinger} onChange={toggle("bollinger")} />
            </Group>

            <Group title={t.groupIndicators}>
              <SwitchLine label={t.volume} checked={features.volume} onChange={toggle("volume")} />
              <SwitchLine label={t.rsi} checked={features.rsi} onChange={toggle("rsi")} />
              <SwitchLine label={t.macd} checked={features.macd} onChange={toggle("macd")} />
            </Group>

            <Group title={t.groupOverlays}>
              <SwitchLine label={t.markers} checked={features.markers} onChange={toggle("markers")} />
              <SwitchLine label={t.priceLines} checked={features.priceLines} onChange={toggle("priceLines")} />
              <SwitchLine
                label={t.customPrimitive}
                checked={features.customPrimitive}
                onChange={toggle("customPrimitive")}
              />
              <SwitchLine
                label={t.crosshairLegend}
                checked={features.crosshairLegend}
                onChange={toggle("crosshairLegend")}
              />
            </Group>

            <Group title={t.groupAxes}>
              <SwitchLine label={t.logScale} checked={logScale} onChange={setLogScale} />
              <SwitchLine label={t.invertScale} checked={invertScale} onChange={setInvertScale} />
              <SwitchLine label={t.autoScale} checked={autoScale} onChange={setAutoScale} />
              <SwitchLine label={t.secondsVisible} checked={secondsVisible} onChange={setSecondsVisible} />
            </Group>

            <Group title={t.groupInteraction}>
              <SwitchLine label={t.shanghaiTime} checked={shanghaiTime} onChange={setShanghaiTime} />
              <SwitchLine label={t.magnet} checked={magnet} onChange={setMagnet} />
              <Row label={t.dataSize}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 px-2 font-normal text-xs">
                      {size}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {DATA_SIZES.map((item) => (
                      <DropdownMenuItem key={item} onSelect={() => setSize(item)}>
                        {item} {t.barsUnit}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Row>
            </Group>

            <Group title={t.groupPlugins}>
              <SwitchLine label={t.watermark} checked={features.watermark} onChange={toggle("watermark")} />
              <div className="flex flex-col gap-2 pt-1">
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={exportPng}>
                  <Camera className="size-3.5" />
                  {t.screenshot}
                </Button>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Download className="size-3" />
                  lightweight-charts v5 · panes / primitives / plugins
                </span>
              </div>
            </Group>
          </CardContent>
        </Card>

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border bg-card">
          <div ref={hostRef} className="h-full w-full" data-slot="chart-lab" />
          {legend && (
            <div className="pointer-events-none absolute top-2 left-3 flex flex-col gap-0.5 rounded-md bg-card/85 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur">
              <span className="font-semibold">{formatLegendTime(legend.time, shanghaiTime)}</span>
              <span className="text-muted-foreground tabular-nums">
                {t.legendOpen} {legend.open.toFixed(2)} · {t.legendHigh} {legend.high.toFixed(2)} · {t.legendLow}{" "}
                {legend.low.toFixed(2)} · {t.legendClose}{" "}
                <span style={{ color: legend.close >= legend.open ? PROFIT : LOSS }}>{legend.close.toFixed(2)}</span>
              </span>
              <span className="text-muted-foreground tabular-nums">
                MA20 {legend.ma20 === null ? "—" : legend.ma20.toFixed(2)} · MA50{" "}
                {legend.ma50 === null ? "—" : legend.ma50.toFixed(2)} · RSI{" "}
                {legend.rsi === null ? "—" : legend.rsi.toFixed(1)} · MACD{" "}
                {legend.macd === null ? "—" : legend.macd.toFixed(2)} · {t.legendVolume} {legend.volume}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatLegendTime(time: number, shanghai: boolean): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: shanghai ? "Asia/Shanghai" : "UTC",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(time * 1000));
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">{title}</span>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      {children}
    </div>
  );
}

function SwitchLine({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface LabTrade {
  id: string;
  side: "buy" | "sell";
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopPrice: number;
  targetPrice: number;
  volume: number;
  pnl: number;
}

function buildTrades(bars: LabBar[]): LabTrade[] {
  const spans: [number, number][] = [
    [0.08, 0.2],
    [0.3, 0.38],
    [0.44, 0.58],
    [0.62, 0.7],
    [0.78, 0.9],
  ];
  return spans.map(([from, to], index) => {
    const entryIndex = Math.floor(bars.length * from);
    const exitIndex = Math.min(bars.length - 1, Math.floor(bars.length * to));
    const entryBar = bars[entryIndex];
    const exitBar = bars[exitIndex];
    const side: "buy" | "sell" = index % 2 === 0 ? "buy" : "sell";
    const direction = side === "buy" ? 1 : -1;
    const risk = 12 + index * 2;
    const volume = 0.1 + index * 0.05;
    return {
      id: `lab-${index}`,
      side,
      entryTime: entryBar.time,
      exitTime: exitBar.time,
      entryPrice: entryBar.close,
      exitPrice: exitBar.close,
      stopPrice: Math.round((entryBar.close - direction * risk) * 100) / 100,
      targetPrice: Math.round((entryBar.close + direction * risk * 1.8) * 100) / 100,
      volume: Math.round(volume * 100) / 100,
      pnl: Math.round((exitBar.close - entryBar.close) * direction * 100 * volume * 100) / 100,
    };
  });
}
