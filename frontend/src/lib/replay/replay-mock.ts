// Deterministic virtual market data for the replay demo page. Nothing here talks
// to the API: bars and trades are generated from a fixed seed so the demo stays
// stable between renders, and a real tick store can replace it later.

export interface ReplayBar {
  /** Unix seconds, UTC (minute close). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ReplayExecution {
  id: string;
  side: "buy" | "sell";
  time: number;
  price: number;
  volume: number;
  label: "entry" | "partial" | "exit";
}

export interface ReplayTrade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  day: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  volume: number;
  pnl: number;
  executions: ReplayExecution[];
}

export interface ReplayDataset {
  symbol: string;
  bars: ReplayBar[];
  trades: ReplayTrade[];
  days: string[];
}

const CONTRACT_SIZE = 100;
const BASE_PRICE = 4412;
const TICK = 0.01;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Math.round(value / TICK) * TICK;

function isoDay(time: number): string {
  return new Date(time * 1000).toISOString().slice(0, 10);
}

/** Build a continuous minute series plus a handful of completed trades. */
export function buildReplayDataset(): ReplayDataset {
  const rng = mulberry32(0x5eed2026);
  const symbol = "XAUUSD";
  const startTime = Math.floor(Date.UTC(2026, 8, 10, 0, 0, 0) / 1000);
  const totalBars = 2160; // 1.5 days of minutes
  const bars: ReplayBar[] = [];

  let price = BASE_PRICE;
  let drift = 0;
  for (let index = 0; index < totalBars; index += 1) {
    if (index % 90 === 0) drift = (rng() - 0.5) * 0.06;
    const open = price;
    const steps = 6;
    let high = open;
    let low = open;
    let close = open;
    for (let step = 0; step < steps; step += 1) {
      close = round(close + (rng() - 0.5) * 0.42 + drift);
      high = Math.max(high, close);
      low = Math.min(low, close);
    }
    bars.push({ time: startTime + index * 60, open, high: round(high), low: round(low), close });
    price = close;
  }

  const trades: ReplayTrade[] = [];
  for (let index = 0; index < 10; index += 1) {
    // Keep entries inside the first day and a half, leaving room for the exit.
    const entryIndex = 30 + Math.floor(rng() * (totalBars - 200));
    const holdBars = 8 + Math.floor(rng() * 70);
    const exitIndex = entryIndex + holdBars;
    const side: "buy" | "sell" = rng() > 0.45 ? "buy" : "sell";
    const volume = [0.05, 0.1, 0.2, 0.5][Math.floor(rng() * 4)];
    const entryBar = bars[entryIndex];
    const exitBar = bars[exitIndex];
    const split = 0.5 + rng() * 0.3;
    const partialIndex = entryIndex + Math.round(holdBars * split);
    const partialBar = bars[partialIndex];
    const direction = side === "buy" ? 1 : -1;
    const partialVolume = Math.round(volume * 0.5 * 100) / 100;
    const finalVolume = Math.round((volume - partialVolume) * 100) / 100;
    const partialPnl = (partialBar.close - entryBar.close) * direction * CONTRACT_SIZE * partialVolume;
    const finalPnl = (exitBar.close - entryBar.close) * direction * CONTRACT_SIZE * finalVolume;
    const executions: ReplayExecution[] = [
      { id: `${index}-in`, side, time: entryBar.time, price: entryBar.close, volume, label: "entry" },
      {
        id: `${index}-p1`,
        side: side === "buy" ? "sell" : "buy",
        time: partialBar.time,
        price: partialBar.close,
        volume: partialVolume,
        label: "partial",
      },
      {
        id: `${index}-out`,
        side: side === "buy" ? "sell" : "buy",
        time: exitBar.time,
        price: exitBar.close,
        volume: finalVolume,
        label: "exit",
      },
    ];
    trades.push({
      id: `r-${index + 1}`,
      symbol,
      side,
      day: isoDay(entryBar.time),
      entryTime: entryBar.time,
      exitTime: exitBar.time,
      entryPrice: entryBar.close,
      exitPrice: exitBar.close,
      volume,
      pnl: Math.round((partialPnl + finalPnl) * 100) / 100,
      executions,
    });
  }

  trades.sort((a, b) => a.entryTime - b.entryTime);
  const days = [...new Set(bars.map((bar) => isoDay(bar.time)))];
  return { symbol, bars, trades, days };
}

/** Merge minute bars into a higher timeframe (bars must be time-ascending). */
export function aggregateBars(bars: ReplayBar[], minutes: number): ReplayBar[] {
  if (minutes <= 1) return bars;
  const seconds = minutes * 60;
  const result: ReplayBar[] = [];
  let bucketStart: number | null = null;
  let current: ReplayBar | null = null;
  for (const bar of bars) {
    const start = bar.time - (bar.time % seconds);
    if (bucketStart !== start || current === null) {
      if (current) result.push(current);
      bucketStart = start;
      current = { time: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
      continue;
    }
    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.close = bar.close;
  }
  if (current) result.push(current);
  return result;
}

/** Index of the last bar whose time is <= the given timestamp. */
export function indexAt(bars: ReplayBar[], time: number): number {
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    if (bars[index].time <= time) return index;
  }
  return 0;
}
