// Virtual series and indicator maths for the chart-lab page. Pure functions so
// the same numbers can later be produced by the server from real ticks.

export interface LabBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LabPoint {
  time: number;
  value: number;
}

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

const round = (value: number) => Math.round(value * 100) / 100;

/** Deterministic 5-minute gold series: `count` bars ending at a fixed time. */
export function buildLabBars(count: number): LabBar[] {
  const rng = mulberry32(0x1ab2026);
  const step = 300;
  const end = Math.floor(Date.UTC(2026, 8, 21, 12, 0, 0) / 1000);
  const start = end - count * step;
  const bars: LabBar[] = [];
  let price = 4386;
  let drift = 0;
  for (let index = 0; index < count; index += 1) {
    if (index % 240 === 0) drift = (rng() - 0.5) * 0.5;
    const open = price;
    let high = open;
    let low = open;
    let close = open;
    for (let tick = 0; tick < 5; tick += 1) {
      close = round(close + (rng() - 0.5) * 1.6 + drift);
      high = Math.max(high, close);
      low = Math.min(low, close);
    }
    const range = high - low;
    bars.push({
      time: start + index * step,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(120 + rng() * 900 + range * 260),
    });
    price = close;
  }
  return bars;
}

export function toLine(points: (number | null)[], bars: LabBar[]): LabPoint[] {
  const result: LabPoint[] = [];
  points.forEach((value, index) => {
    if (value === null) return;
    result.push({ time: bars[index].time, value: round(value) });
  });
  return result;
}

export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    result.push(index >= period - 1 ? sum / period : null);
  }
  return result;
}

export function bollinger(values: number[], period = 20, multiplier = 2) {
  const middle = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const mean = middle[index];
    if (mean === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let variance = 0;
    for (let offset = 0; offset < period; offset += 1) {
      variance += (values[index - offset] - mean) ** 2;
    }
    const deviation = Math.sqrt(variance / period);
    upper.push(mean + multiplier * deviation);
    lower.push(mean - multiplier * deviation);
  }
  return { middle, upper, lower };
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [null];
  let gain = 0;
  let loss = 0;
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (index <= period) {
      gain += up;
      loss += down;
      if (index === period) {
        const rs = loss === 0 ? Number.POSITIVE_INFINITY : gain / period / (loss / period);
        result.push(100 - 100 / (1 + rs));
      } else {
        result.push(null);
      }
      continue;
    }
    gain = (gain * (period - 1) + up) / period;
    loss = (loss * (period - 1) + down) / period;
    const rs = loss === 0 ? Number.POSITIVE_INFINITY : gain / loss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  let previous: number | null = null;
  values.forEach((value, index) => {
    if (previous === null) {
      if (index === period - 1) {
        const seed = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
        previous = seed;
        result.push(seed);
      } else {
        result.push(null);
      }
      return;
    }
    previous = value * multiplier + previous * (1 - multiplier);
    result.push(previous);
  });
  return result;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastLine = ema(values, fast);
  const slowLine = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, index) => {
    const a = fastLine[index];
    const b = slowLine[index];
    return a === null || b === null ? null : a - b;
  });
  const compact = macdLine.filter((value): value is number => value !== null);
  const signalCompact = ema(compact, signalPeriod);
  const signal: (number | null)[] = [];
  let cursor = 0;
  for (const value of macdLine) {
    if (value === null) {
      signal.push(null);
      continue;
    }
    signal.push(signalCompact[cursor] ?? null);
    cursor += 1;
  }
  const histogram: (number | null)[] = macdLine.map((value, index) => {
    const slowValue = signal[index];
    return value === null || slowValue === null ? null : value - slowValue;
  });
  return { macd: macdLine, signal, histogram };
}
