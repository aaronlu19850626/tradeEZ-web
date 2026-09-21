// Scoring engine for the dashboard module. Every number here is derived from
// closed trades only, and every dimension keeps its raw value so the UI can
// explain the score instead of showing a black box.

import { type MockTrade, shanghaiDayKey } from "./trades-mock";

export type ScoreDimensionKey = "expectancy" | "risk" | "payoff" | "recovery" | "consistency" | "winRate";

export interface ScoreDimension {
  key: ScoreDimensionKey;
  weight: number;
  /** Raw metric behind the score; null when the sample cannot produce it. */
  raw: number | null;
  score: number;
}

export interface CompositeScore {
  insufficient: boolean;
  sampleTrades: number;
  validR: number;
  /** null while the sample is too small to be meaningful. */
  total: number | null;
  dimensions: ScoreDimension[];
  weakest: ScoreDimensionKey[];
}

export type TradeScoreItemKey = "result" | "risk" | "exit" | "cost" | "review";

export interface TradeScoreItem {
  key: TradeScoreItemKey;
  weight: number;
  score: number;
}

export type TradeScoreLabel =
  | "planTp"
  | "planSl"
  | "manualExit"
  | "noStop"
  | "riskHigh"
  | "costHigh"
  | "highR"
  | "reviewed"
  | "pendingReview";

export interface TradeScore {
  total: number;
  reviewed: boolean;
  items: TradeScoreItem[];
  labels: TradeScoreLabel[];
}

/** Minimum sample sizes before a composite score is shown at all. */
export const MIN_SAMPLE_TRADES = 30;
export const MIN_SAMPLE_VALID_R = 20;

const DIMENSION_WEIGHTS: Record<ScoreDimensionKey, number> = {
  expectancy: 0.25,
  risk: 0.2,
  payoff: 0.15,
  recovery: 0.15,
  consistency: 0.15,
  winRate: 0.1,
};

/**
 * Piecewise-linear mapping from a raw metric to 0-100, given ascending
 * breakpoints. Values outside the range clamp to the first/last score.
 */
function piecewise(value: number, points: [number, number][]): number {
  if (!Number.isFinite(value)) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (value <= x2) {
      const ratio = (value - x1) / (x2 - x1 || 1);
      return y1 + ratio * (y2 - y1);
    }
  }
  return last[1];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

/** Max drawdown of a running series (peak to later trough). */
function maxDrawdown(series: number[]): number {
  let peak = 0;
  let worst = 0;
  for (const value of series) {
    peak = Math.max(peak, value);
    worst = Math.min(worst, value - peak);
  }
  return Math.abs(worst);
}

function runningSeries(trades: MockTrade[], pick: (trade: MockTrade) => number): number[] {
  const ordered = [...trades].sort((a, b) => a.closeTime - b.closeTime);
  let running = 0;
  return ordered.map((trade) => {
    running += pick(trade);
    return running;
  });
}

function dailyNet(trades: MockTrade[]): number[] {
  const buckets = new Map<string, number>();
  for (const trade of trades) {
    const day = shanghaiDayKey(trade.closeTime);
    buckets.set(day, (buckets.get(day) ?? 0) + trade.netPnl);
  }
  return [...buckets.values()];
}

export function compositeScore(trades: MockTrade[]): CompositeScore {
  const rTrades = trades.filter((trade) => trade.rMultiple !== null);
  const rValues = rTrades.map((trade) => trade.rMultiple as number);
  const wins = trades.filter((trade) => trade.netPnl > 0);
  const winR = rValues.filter((value) => value > 0);
  const lossR = rValues.filter((value) => value < 0);

  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const moneyCurve = runningSeries(trades, (trade) => trade.netPnl);
  const moneyDrawdown = maxDrawdown(moneyCurve);
  const rCurve = runningSeries(rTrades, (trade) => trade.rMultiple as number);
  const drawdownR = maxDrawdown(rCurve);
  const worstR = rValues.length ? Math.min(...rValues) : 0;

  const expectancy = rValues.length ? mean(rValues) : null;
  const payoff = winR.length && lossR.length ? mean(winR) / Math.abs(mean(lossR)) : null;
  let recovery = 0;
  if (moneyDrawdown > 0) recovery = netPnl / moneyDrawdown;
  else if (netPnl > 0) recovery = 3;
  const winRate = trades.length ? wins.length / trades.length : 0;

  const dayValues = dailyNet(trades);
  const winDayRate = dayValues.length ? dayValues.filter((value) => value > 0).length / dayValues.length : 0;
  const dayAbsMean = Math.abs(mean(dayValues));
  const dayStd = dayValues.length ? Math.sqrt(mean(dayValues.map((value) => (value - mean(dayValues)) ** 2))) : 0;
  const volatilityPenalty = dayAbsMean > 0 ? clamp(1 - dayStd / dayAbsMean / 3, 0.6, 1) : 0.6;

  const riskScore =
    0.6 *
      piecewise(drawdownR, [
        [5, 100],
        [10, 80],
        [20, 50],
        [40, 0],
      ]) +
    0.4 *
      piecewise(-worstR, [
        [2, 100],
        [3, 75],
        [4, 50],
        [6, 0],
      ]);

  const dimensions: ScoreDimension[] = [
    {
      key: "expectancy",
      weight: DIMENSION_WEIGHTS.expectancy,
      raw: expectancy === null ? null : round(expectancy, 3),
      score:
        expectancy === null
          ? 0
          : piecewise(expectancy, [
              [-0.5, 0],
              [0, 50],
              [0.3, 80],
              [0.6, 100],
            ]),
    },
    { key: "risk", weight: DIMENSION_WEIGHTS.risk, raw: round(drawdownR, 2), score: riskScore },
    {
      key: "payoff",
      weight: DIMENSION_WEIGHTS.payoff,
      raw: payoff === null ? null : round(payoff, 3),
      score:
        payoff === null
          ? 0
          : piecewise(payoff, [
              [0.8, 0],
              [1, 50],
              [1.5, 85],
              [2, 100],
            ]),
    },
    {
      key: "recovery",
      weight: DIMENSION_WEIGHTS.recovery,
      raw: round(recovery, 3),
      score: piecewise(recovery, [
        [0, 0],
        [1, 50],
        [2, 80],
        [3, 100],
      ]),
    },
    {
      key: "consistency",
      weight: DIMENSION_WEIGHTS.consistency,
      raw: round(winDayRate, 4),
      score:
        piecewise(winDayRate, [
          [0.3, 0],
          [0.45, 50],
          [0.55, 75],
          [0.65, 100],
        ]) * volatilityPenalty,
    },
    {
      key: "winRate",
      weight: DIMENSION_WEIGHTS.winRate,
      raw: round(winRate, 4),
      score: piecewise(winRate, [
        [0.3, 0],
        [0.5, 60],
        [0.65, 85],
        [0.8, 100],
      ]),
    },
  ];

  const insufficient = trades.length < MIN_SAMPLE_TRADES || rValues.length < MIN_SAMPLE_VALID_R;
  const total = insufficient
    ? null
    : round(
        dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0),
        1,
      );
  const weakest = [...dimensions]
    .sort((a, b) => a.score / 100 - b.score / 100)
    .slice(0, 2)
    .map((dimension) => dimension.key);

  return {
    insufficient,
    sampleTrades: trades.length,
    validR: rValues.length,
    total,
    dimensions: dimensions.map((dimension) => ({ ...dimension, score: round(dimension.score, 1) })),
    weakest,
  };
}

const TRADE_ITEM_WEIGHTS: Record<TradeScoreItemKey, number> = {
  result: 0.3,
  risk: 0.2,
  exit: 0.15,
  cost: 0.15,
  review: 0.2,
};

/** Money at risk when the trade was opened; null when it cannot be derived. */
function initialRisk(trade: MockTrade): number | null {
  if (trade.rMultiple === null || trade.rMultiple === 0 || trade.netPnl === 0) return null;
  const risk = trade.netPnl / trade.rMultiple;
  return risk > 0 ? risk : null;
}

export function scoreTrade(trade: MockTrade, averageRisk: number | null, reviewed = false): TradeScore {
  const labels: TradeScoreLabel[] = [];
  const r = trade.rMultiple;

  const resultScore =
    r === null
      ? 50
      : piecewise(r, [
          [-1.5, 0],
          [-1, 25],
          [0, 50],
          [1, 75],
          [2, 90],
          [3, 100],
        ]);

  const risk = initialRisk(trade);
  const hasStop = trade.slPrice !== null;
  let riskScore = 0;
  if (!hasStop) {
    labels.push("noStop");
  } else if (risk !== null && averageRisk && averageRisk > 0) {
    const ratio = risk / averageRisk;
    riskScore = clamp(100 - 25 * Math.abs(ratio - 1), 0, 100);
    if (ratio > 1.5) labels.push("riskHigh");
  } else {
    riskScore = 70;
  }

  const riskDistance =
    trade.slPrice !== null && trade.openPrice !== null ? Math.abs(trade.openPrice - trade.slPrice) : null;
  const tolerance = riskDistance !== null ? riskDistance * 0.2 : null;
  let exitScore = 40;
  if (riskDistance !== null && tolerance !== null) {
    const nearTp = trade.tpPrice !== null && Math.abs(trade.closePrice - trade.tpPrice) <= tolerance;
    const nearSl = trade.slPrice !== null && Math.abs(trade.closePrice - trade.slPrice) <= tolerance;
    if (nearTp) {
      exitScore = 100;
      labels.push("planTp");
    } else if (nearSl) {
      exitScore = 90;
      labels.push("planSl");
    } else {
      exitScore = 60;
      labels.push("manualExit");
    }
  }

  const costs = Math.abs(trade.commission) + Math.abs(trade.swap);
  const gross = Math.abs(trade.grossPnl);
  let costRatio = 0;
  if (gross > 0) costRatio = costs / gross;
  else if (costs > 0) costRatio = 1;
  const costScore = piecewise(costRatio, [
    [0.02, 100],
    [0.1, 70],
    [0.25, 40],
    [0.5, 0],
  ]);
  if (costRatio > 0.25) labels.push("costHigh");
  if (r !== null && r >= 2) labels.push("highR");

  // The review module is not built yet: the slot exists so the score is already
  // structured for it, and unreviewed trades cap at 80 points.
  const reviewScore = reviewed ? 100 : 0;
  labels.push(reviewed ? "reviewed" : "pendingReview");

  const items: TradeScoreItem[] = [
    { key: "result", weight: TRADE_ITEM_WEIGHTS.result, score: round(resultScore, 1) },
    { key: "risk", weight: TRADE_ITEM_WEIGHTS.risk, score: round(riskScore, 1) },
    { key: "exit", weight: TRADE_ITEM_WEIGHTS.exit, score: round(exitScore, 1) },
    { key: "cost", weight: TRADE_ITEM_WEIGHTS.cost, score: round(costScore, 1) },
    { key: "review", weight: TRADE_ITEM_WEIGHTS.review, score: round(reviewScore, 1) },
  ];

  return {
    total: round(
      items.reduce((sum, item) => sum + item.score * item.weight, 0),
      1,
    ),
    reviewed,
    items,
    labels,
  };
}

/** Average money at risk across trades, used to flag oversized positions. */
export function averageRiskOf(trades: MockTrade[]): number | null {
  const risks = trades.map(initialRisk).filter((value): value is number => value !== null);
  return risks.length ? mean(risks) : null;
}
