import type { MarketProfile } from "@/lib/tradesync/trade-center";

export type ResolvedMarketProfile = MarketProfile | "mixed";

export function resolveMarketProfile(values: (MarketProfile | null | undefined)[]): ResolvedMarketProfile {
  const profiles = [...new Set(values.filter((value): value is MarketProfile => value === "cn" || value === "fx"))];
  if (profiles.length === 0) return "fx";
  if (profiles.length === 1) return profiles[0];
  return "mixed";
}

export function readMarketColor(
  variable: "--profit" | "--profit-strong" | "--profit-soft" | "--loss" | "--loss-strong" | "--loss-soft",
  fallback: string,
): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback;
}

export const MARKET_COLOR_FALLBACKS = {
  fx: {
    profit: "#3bcb9a",
    profitStrong: "#4dd6a4",
    loss: "#ff6868",
    lossStrong: "#ff7373",
  },
  cn: {
    profit: "#ff6868",
    profitStrong: "#ff7373",
    loss: "#3bcb9a",
    lossStrong: "#4dd6a4",
  },
} as const satisfies Record<MarketProfile, Record<string, string>>;
