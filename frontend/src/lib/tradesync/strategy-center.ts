import { createGoldStrategySeeds } from "./gold-strategy-presets";
import { EMPTY_STRATEGY_TAGS, type StrategyTagCategoryId } from "./strategy-tags";

export type StrategyRuleOutcome = "always" | "winner" | "loser" | "breakeven";
export type StrategyEvaluationStatus = "pass" | "fail" | "unknown" | "na";
export type StrategyStatus = "active" | "archived";
export type StrategyVersionStatus = "draft" | "published";

export interface StrategyVersion {
  version: number;
  status: StrategyVersionStatus;
  createdAt: string;
  publishedAt: string | null;
}

export interface StrategyRule {
  id: string;
  name: string;
  outcome: StrategyRuleOutcome;
  critical: boolean;
}

export interface StrategyRuleGroup {
  id: string;
  name: string;
  rules: StrategyRule[];
}

export interface StrategyEvaluation {
  linkId: string;
  answers: Record<string, { status: StrategyEvaluationStatus; evidence: string }>;
  complete: boolean;
  score: number | null;
}

export interface StrategyLinkedTrade {
  linkId: string;
  tradeId: string;
  accountName: string;
  symbol: string;
  side: "buy" | "sell";
  openTime: number;
  closeTime: number;
  netPnl: number;
  evaluation: StrategyEvaluation | null;
}

export interface StrategyMetrics {
  trades: number;
  netPnl: number;
  winRate: number;
  profitFactor: number | null;
  averageWinner: number | null;
  averageLoser: number | null;
  expectancy: number;
  dailyWinRate: number;
  averageDurationSec: number | null;
  winners: number;
  losers: number;
  breakeven: number;
}

export interface StrategyMock {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: StrategyStatus;
  tags: Record<StrategyTagCategoryId, string[]>;
  groups: StrategyRuleGroup[];
  trades: StrategyLinkedTrade[];
  notes: string;
  publishedVersion: number;
  draftVersion: number | null;
  versions: StrategyVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface MockTradeCandidate {
  tradeId: string;
  accountName: string;
  symbol: string;
  side: "buy" | "sell";
  openTime: number;
  closeTime: number;
  netPnl: number;
}

const STORAGE_KEY = "tradeez.strategy-mock.v1";

export const MOCK_TRADE_CANDIDATES: MockTradeCandidate[] = [
  {
    tradeId: "1033-880001",
    accountName: "MT5 1033",
    symbol: "XAUUSD",
    side: "buy",
    openTime: Math.floor(Date.now() / 1000) - 86400,
    closeTime: Math.floor(Date.now() / 1000) - 82800,
    netPnl: 186.4,
  },
  {
    tradeId: "1033-880002",
    accountName: "MT5 1033",
    symbol: "EURUSD",
    side: "sell",
    openTime: Math.floor(Date.now() / 1000) - 172800,
    closeTime: Math.floor(Date.now() / 1000) - 166200,
    netPnl: -62.8,
  },
  {
    tradeId: "1033-880003",
    accountName: "MT5 1033",
    symbol: "XAUUSD",
    side: "sell",
    openTime: Math.floor(Date.now() / 1000) - 259200,
    closeTime: Math.floor(Date.now() / 1000) - 252600,
    netPnl: 94.2,
  },
  {
    tradeId: "2079-900011",
    accountName: "MT5 2079",
    symbol: "GBPUSD",
    side: "buy",
    openTime: Math.floor(Date.now() / 1000) - 345600,
    closeTime: Math.floor(Date.now() / 1000) - 338400,
    netPnl: 211.7,
  },
  {
    tradeId: "2079-900012",
    accountName: "MT5 2079",
    symbol: "USDJPY",
    side: "sell",
    openTime: Math.floor(Date.now() / 1000) - 432000,
    closeTime: Math.floor(Date.now() / 1000) - 421200,
    netPnl: -128.5,
  },
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyEvaluation(linkId: string): StrategyEvaluation {
  return { linkId, answers: {}, complete: false, score: null };
}

function defaultStrategies(): StrategyMock[] {
  const now = new Date().toISOString();
  const orderFlowTrades: StrategyLinkedTrade[] = [
    {
      linkId: "link-1",
      tradeId: "1033-880001",
      accountName: "MT5 1033",
      symbol: "XAUUSD",
      side: "buy",
      openTime: Math.floor(Date.now() / 1000) - 86400,
      closeTime: Math.floor(Date.now() / 1000) - 82800,
      netPnl: 186.4,
      evaluation: {
        linkId: "link-1",
        answers: {
          "rule-order-flow": { status: "pass", evidence: "价格从高成交量节点向上突破。" },
          "rule-confirmation": { status: "pass", evidence: "等待回踩后出现买方吸收。" },
          "rule-risk": { status: "pass", evidence: "风险控制在账户 0.7%。" },
        },
        complete: true,
        score: 100,
      },
    },
    {
      linkId: "link-2",
      tradeId: "1033-880002",
      accountName: "MT5 1033",
      symbol: "EURUSD",
      side: "sell",
      openTime: Math.floor(Date.now() / 1000) - 172800,
      closeTime: Math.floor(Date.now() / 1000) - 166200,
      netPnl: -62.8,
      evaluation: {
        linkId: "link-2",
        answers: {
          "rule-order-flow": { status: "fail", evidence: "关键位置没有出现明确吸收。" },
          "rule-confirmation": { status: "pass", evidence: "等待了确认信号。" },
          "rule-risk": { status: "pass", evidence: "止损符合计划。" },
        },
        complete: true,
        score: 66.67,
      },
    },
  ];
  return [
    ...createGoldStrategySeeds(),
    {
      id: "order-flow",
      name: "Order Flow Strategy",
      description: "A scalping strategy that uses order flow to identify key support and resistance zones.",
      icon: "OF",
      color: "#6B4FC4",
      status: "active",
      tags: {
        traderTypes: ["scalper", "day_trader", "order_flow"],
        technicalDirections: ["order_flow", "price_action"],
        marketTypes: ["spot_gold", "precious_metals"],
      },
      groups: [
        {
          id: "group-entry",
          name: "Entry criteria",
          rules: [
            {
              id: "rule-order-flow",
              name: "价格在高成交量节点出现明确吸收",
              outcome: "always",
              critical: true,
            },
            {
              id: "rule-confirmation",
              name: "等待回踩或突破后的确认信号",
              outcome: "always",
              critical: false,
            },
          ],
        },
        {
          id: "group-risk",
          name: "Risk context",
          rules: [
            {
              id: "rule-risk",
              name: "单笔风险不超过账户权益的 1%",
              outcome: "always",
              critical: true,
            },
          ],
        },
      ],
      trades: orderFlowTrades,
      notes: "重点观察开盘后 30 分钟的吸收形态，只记录实际执行的交易。",
      publishedVersion: 1,
      draftVersion: null,
      versions: [{ version: 1, status: "published", createdAt: now, publishedAt: now }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "break-retest",
      name: "Break & Retest",
      description: "等待关键位置突破并回踩确认后，再顺势进入。",
      icon: "BR",
      color: "#2E7D6B",
      status: "active",
      tags: {
        traderTypes: ["day_trader", "breakout_trader"],
        technicalDirections: ["breakout", "price_action"],
        marketTypes: ["spot_gold", "forex"],
      },
      groups: [
        {
          id: "group-break",
          name: "Break",
          rules: [
            {
              id: "rule-level-break",
              name: "关键价位被有效突破",
              outcome: "always",
              critical: true,
            },
          ],
        },
      ],
      trades: [],
      notes: "",
      publishedVersion: 1,
      draftVersion: null,
      versions: [{ version: 1, status: "published", createdAt: now, publishedAt: now }],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function readMockStrategies(): StrategyMock[] {
  if (typeof window === "undefined") return defaultStrategies();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = defaultStrategies();
    writeMockStrategies(initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(raw) as StrategyMock[];
    return Array.isArray(parsed)
      ? parsed.map((strategy) => ({
          ...strategy,
          tags: strategy.tags ?? structuredClone(EMPTY_STRATEGY_TAGS),
          versions:
            strategy.versions?.length > 0
              ? strategy.versions
              : [
                  {
                    version: strategy.publishedVersion || 1,
                    status: "published",
                    createdAt: strategy.createdAt,
                    publishedAt: strategy.updatedAt,
                  },
                ],
        }))
      : defaultStrategies();
  } catch {
    return defaultStrategies();
  }
}

export function writeMockStrategies(strategies: StrategyMock[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
  window.dispatchEvent(new CustomEvent("strategy-mock-updated"));
}

export function createStrategyFromDraft(
  draft: Omit<
    StrategyMock,
    "id" | "trades" | "notes" | "publishedVersion" | "draftVersion" | "versions" | "createdAt" | "updatedAt"
  >,
): StrategyMock {
  const now = new Date().toISOString();
  return {
    ...draft,
    id: uid("strategy"),
    trades: [],
    notes: "",
    publishedVersion: 1,
    draftVersion: null,
    versions: [
      {
        version: 1,
        status: "published",
        createdAt: now,
        publishedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateStrategy(strategy: StrategyMock, existingNames: string[]): StrategyMock {
  const base = `${strategy.name} copy`;
  let name = base;
  let suffix = 2;
  while (existingNames.includes(name)) {
    name = `${base} ${suffix}`;
    suffix += 1;
  }
  const now = new Date().toISOString();
  return {
    ...strategy,
    id: uid("strategy"),
    name,
    status: "active",
    trades: [],
    notes: "",
    publishedVersion: 1,
    draftVersion: null,
    versions: [
      {
        version: 1,
        status: "published",
        createdAt: now,
        publishedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    groups: strategy.groups.map((group) => ({
      id: uid("group"),
      name: group.name,
      rules: group.rules.map((rule) => ({ ...rule, id: uid("rule") })),
    })),
  };
}

export function strategyMetrics(strategy: StrategyMock): StrategyMetrics {
  const trades = strategy.trades;
  const winners = trades.filter((trade) => trade.netPnl > 0);
  const losers = trades.filter((trade) => trade.netPnl < 0);
  const breakeven = trades.filter((trade) => trade.netPnl === 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0));
  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const distinctDays = new Set(trades.map((trade) => new Date(trade.closeTime * 1000).toISOString().slice(0, 10)));
  const winningDays = new Set<string>();
  const dayPnl = new Map<string, number>();
  for (const trade of trades) {
    const day = new Date(trade.closeTime * 1000).toISOString().slice(0, 10);
    dayPnl.set(day, (dayPnl.get(day) ?? 0) + trade.netPnl);
  }
  for (const [day, net] of dayPnl) {
    if (net > 0) winningDays.add(day);
  }
  const durationTotal = trades.reduce((sum, trade) => sum + Math.max(0, trade.closeTime - trade.openTime), 0);
  return {
    trades: trades.length,
    netPnl,
    winRate: trades.length ? (winners.length / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    averageWinner: winners.length ? grossProfit / winners.length : null,
    averageLoser: losers.length ? -grossLoss / losers.length : null,
    expectancy: trades.length ? netPnl / trades.length : 0,
    dailyWinRate: distinctDays.size ? (winningDays.size / distinctDays.size) * 100 : 0,
    averageDurationSec: trades.length ? durationTotal / trades.length : null,
    winners: winners.length,
    losers: losers.length,
    breakeven: breakeven.length,
  };
}

export function ruleStats(strategy: StrategyMock) {
  const rules = strategy.groups.flatMap((group) => group.rules);
  return Object.fromEntries(
    rules.map((rule) => {
      const evaluated = strategy.trades.filter((trade) => trade.evaluation?.answers[rule.id]);
      const passed = evaluated.filter((trade) => trade.evaluation?.answers[rule.id]?.status === "pass");
      const failed = evaluated.filter((trade) => trade.evaluation?.answers[rule.id]?.status === "fail");
      const grossProfit = passed.reduce((sum, trade) => sum + Math.max(0, trade.netPnl), 0);
      const grossLoss = Math.abs(passed.reduce((sum, trade) => sum + Math.min(0, trade.netPnl), 0));
      return [
        rule.id,
        {
          ruleId: rule.id,
          name: rule.name,
          evaluated: evaluated.length,
          passed: passed.length,
          failed: failed.length,
          followRate: evaluated.length ? (passed.length / evaluated.length) * 100 : 0,
          netPnl: passed.reduce((sum, trade) => sum + trade.netPnl, 0),
          profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
          winRate: passed.length ? (passed.filter((trade) => trade.netPnl > 0).length / passed.length) * 100 : 0,
        },
      ];
    }),
  );
}

export { emptyEvaluation };
