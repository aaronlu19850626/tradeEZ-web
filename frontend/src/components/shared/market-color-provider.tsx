"use client";

import { createContext, type ReactNode, useContext, useLayoutEffect } from "react";

import type { ResolvedMarketProfile } from "@/lib/market-colors";

const MarketColorContext = createContext<ResolvedMarketProfile>("fx");

export function MarketColorProvider({
  profile,
  children,
}: {
  profile: ResolvedMarketProfile;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.marketProfile;
    root.dataset.marketProfile = profile;
    return () => {
      if (previous) root.dataset.marketProfile = previous;
      else delete root.dataset.marketProfile;
    };
  }, [profile]);

  return (
    <MarketColorContext.Provider value={profile}>
      <div data-market-profile={profile} className="contents">
        {children}
      </div>
    </MarketColorContext.Provider>
  );
}

export function useMarketColorProfile(): ResolvedMarketProfile {
  return useContext(MarketColorContext);
}
