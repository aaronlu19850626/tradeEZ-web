"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/lib/i18n";
import { fill, type ReplayText, replayText } from "@/lib/replay/replay-i18n";
import {
  aggregateBars,
  buildReplayDataset,
  indexAt,
  type ReplayBar,
  type ReplayExecution,
  type ReplayTrade,
} from "@/lib/replay/replay-mock";

const PROFIT = "#4ebf94";
const LOSS = "#f06363";
const GRID = "#eceaf4";
const SPEEDS = [1, 2, 5, 10, 50];
const TIMEFRAMES = [1, 5, 15, 60];

function clock(time: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(time * 1000));
}

function clockShort(time: number): string {
  return clock(time).slice(0, 5);
}

function money(value: number): string {
  const amount = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${value < 0 ? "-" : ""}$${amount}`;
}

export default function ReplayPage() {
  const locale = useLocale();
  const t = replayText[locale];
  const dataset = useMemo(() => buildReplayDataset(), []);

  const [day, setDay] = useState(dataset.days[0] ?? "");
  const [minutes, setMinutes] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [included, setIncluded] = useState<string[]>(() => dataset.trades.map((trade) => trade.id));

  const bars = useMemo(() => aggregateBars(dataset.bars, minutes), [dataset.bars, minutes]);
  const dayTrades = useMemo(() => dataset.trades.filter((trade) => trade.day === day), [dataset.trades, day]);
  const selectedTrade = useMemo(
    () => dayTrades.find((trade) => trade.id === selectedTradeId) ?? dayTrades[0] ?? null,
    [dayTrades, selectedTradeId],
  );

  const chartHostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const renderedRef = useRef(0);

  // Chart is created once; series data and markers follow the replay cursor.
  useEffect(() => {
    const host = chartHostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#6b7280",
        attributionLogo: false,
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.15 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { horzLine: { visible: true }, vertLine: { visible: true } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: PROFIT,
      downColor: LOSS,
      borderVisible: false,
      wickUpColor: PROFIT,
      wickDownColor: LOSS,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      renderedRef.current = 0;
    };
  }, []);

  // Reset the cursor whenever the day or timeframe changes.
  useEffect(() => {
    const firstTrade = dataset.trades.find((trade) => trade.day === day);
    const startIndex = firstTrade ? Math.max(0, indexAt(bars, firstTrade.entryTime) - 40) : 0;
    renderedRef.current = 0;
    setPlaying(false);
    setCursor(startIndex);
  }, [bars, day, dataset.trades]);

  // Push only the revealed bars into the chart.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const count = Math.min(cursor + 1, bars.length);
    if (count <= 0) return;
    const visible = bars.slice(0, count);
    const previous = renderedRef.current;
    if (count === previous + 1 && previous > 0) {
      series.update(candle(visible[count - 1]));
      if (playing) chart.timeScale().scrollToRealTime();
    } else {
      series.setData(visible.map(candle));
      if (Math.abs(count - previous) > 1 || previous === 0) chart.timeScale().fitContent();
    }
    renderedRef.current = count;
  }, [bars, cursor, playing]);

  // Mark the executions of the checked trades up to the current bar.
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    const currentTime = bars[Math.min(cursor, bars.length - 1)]?.time ?? 0;
    const list: SeriesMarker<Time>[] = [];
    for (const trade of dataset.trades) {
      if (!included.includes(trade.id)) continue;
      for (const execution of trade.executions) {
        if (execution.time > currentTime) continue;
        const bar = bars[indexAt(bars, execution.time)];
        if (!bar) continue;
        const buy = execution.side === "buy";
        list.push({
          time: bar.time as UTCTimestamp,
          position: buy ? "belowBar" : "aboveBar",
          color: buy ? PROFIT : LOSS,
          shape: buy ? "arrowUp" : "arrowDown",
          text: labelText(t, execution.label),
        });
      }
    }
    list.sort((a, b) => (a.time as number) - (b.time as number));
    markers.setMarkers(list);
  }, [bars, cursor, dataset.trades, included, t]);

  // Playback timer: one bar per tick, faster with the speed multiplier.
  useEffect(() => {
    if (!playing) return;
    const interval = Math.max(16, Math.round(900 / speed));
    const id = window.setInterval(() => {
      setCursor((prev) => {
        if (prev >= bars.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [playing, speed, bars.length]);

  const step = (delta: number) => {
    setPlaying(false);
    setCursor((prev) => Math.min(bars.length - 1, Math.max(0, prev + delta)));
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[560px] min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-3xl tracking-tight">{t.title}</h1>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {t.demoBadge}
          </Badge>
          <span className="text-muted-foreground text-sm">{dataset.symbol}</span>
        </div>
        <span className="text-muted-foreground text-xs">{t.subtitle}</span>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        <aside className="flex w-[292px] shrink-0 flex-col gap-3">
          <Card className="flex min-h-0 flex-1 flex-col gap-0 pt-4 pb-3">
            <CardHeader className="flex flex-row items-center justify-between py-0">
              <CardTitle className="text-sm">{t.playback}</CardTitle>
              <Badge variant="outline" className="text-muted-foreground">
                {fill(t.tradeCount, { count: dayTrades.length })}
              </Badge>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2 pt-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {day}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {dataset.days.map((item) => (
                    <DropdownMenuItem key={item} onSelect={() => setDay(item)}>
                      {item}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
                {dayTrades.length === 0 && <p className="text-muted-foreground text-sm">{t.noTrades}</p>}
                {dayTrades.map((trade) => (
                  <TradeRow
                    key={trade.id}
                    trade={trade}
                    active={selectedTrade?.id === trade.id}
                    checked={included.includes(trade.id)}
                    onSelect={() => setSelectedTradeId(trade.id)}
                    onToggle={(next) =>
                      setIncluded((prev) => (next ? [...prev, trade.id] : prev.filter((id) => id !== trade.id)))
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shrink-0 gap-0 pt-4 pb-3">
            <CardHeader className="py-0">
              <CardTitle className="text-sm">
                {t.executions}{" "}
                <span className="font-normal text-muted-foreground text-xs">
                  ({fill(t.executionsSelected, { count: selectedTrade ? 1 : 0 })})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 pt-3">
              {selectedTrade?.executions.map((execution) => (
                <div key={execution.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: execution.side === "buy" ? PROFIT : LOSS }}
                  />
                  <span className="w-16 text-muted-foreground tabular-nums">{clock(execution.time)}</span>
                  <span className="flex-1 text-right tabular-nums">{execution.price.toFixed(2)}</span>
                  <span
                    className="w-14 text-right tabular-nums"
                    style={{ color: execution.side === "buy" ? PROFIT : LOSS }}
                  >
                    {execution.side === "buy" ? "+" : "-"}
                    {execution.volume.toFixed(2)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
            <div ref={chartHostRef} className="h-full w-full" data-slot="replay-chart" />
          </div>

          <Card className="shrink-0 gap-0 px-4 pt-3 pb-3">
            <div className="flex flex-col gap-2">
              <input
                type="range"
                aria-label={t.progress}
                min={0}
                max={Math.max(0, bars.length - 1)}
                value={cursor}
                onChange={(event) => {
                  setPlaying(false);
                  setCursor(Number(event.target.value));
                }}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#d9d5ea] accent-[#6b5aa8]"
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-8 gap-1.5 px-2.5 font-normal text-xs">
                      {speed}x
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-24">
                    {SPEEDS.map((item) => (
                      <DropdownMenuItem key={item} onSelect={() => setSpeed(item)}>
                        {item}x
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <ControlButton label={t.skipStart} onClick={() => step(-cursor)}>
                  <SkipBack className="size-4" />
                </ControlButton>
                <ControlButton label={t.stepBack} onClick={() => step(-1)}>
                  <StepBack className="size-4" />
                </ControlButton>
                <Button
                  size="icon-sm"
                  className="size-8 rounded-full"
                  aria-label={playing ? t.pause : t.play}
                  onClick={() => {
                    if (cursor >= bars.length - 1) setCursor(0);
                    setPlaying((prev) => !prev);
                  }}
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
                <ControlButton label={t.stepForward} onClick={() => step(1)}>
                  <StepForward className="size-4" />
                </ControlButton>
                <ControlButton label={t.skipEnd} onClick={() => step(bars.length - 1)}>
                  <SkipForward className="size-4" />
                </ControlButton>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-8 px-2.5 font-normal text-xs">
                      {minutes < 60 ? `${minutes} ${t.minute}` : `1 ${t.hour}`}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-24">
                    {TIMEFRAMES.map((item) => (
                      <DropdownMenuItem key={item} onSelect={() => setMinutes(item)}>
                        {item < 60 ? `${item} ${t.minute}` : `1 ${t.hour}`}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-center text-muted-foreground text-xs">{t.hint}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function candle(bar: ReplayBar) {
  return {
    time: bar.time as UTCTimestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="outline" size="icon-sm" aria-label={label} className="size-8" onClick={onClick}>
      {children}
    </Button>
  );
}

function TradeRow({
  trade,
  active,
  checked,
  onSelect,
  onToggle,
}: {
  trade: ReplayTrade;
  active: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
        active ? "border-primary/40 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"
      }`}
    >
      <Checkbox checked={checked} onCheckedChange={(next) => onToggle(Boolean(next))} className="mt-0.5" />
      <button type="button" onClick={onSelect} className="flex flex-1 flex-col items-start gap-0.5 text-left">
        <span className="flex w-full items-center justify-between gap-2">
          <span className="font-medium text-xs">{trade.symbol.slice(0, 3)}</span>
          <span className="font-semibold text-xs tabular-nums" style={{ color: trade.pnl >= 0 ? PROFIT : LOSS }}>
            {money(trade.pnl)}
          </span>
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {clockShort(trade.entryTime)} - {clockShort(trade.exitTime)}
        </span>
      </button>
    </div>
  );
}

function labelText(t: ReplayText, label: ReplayExecution["label"]) {
  if (label === "entry") return t.entry;
  if (label === "exit") return t.exit;
  return t.partial;
}
