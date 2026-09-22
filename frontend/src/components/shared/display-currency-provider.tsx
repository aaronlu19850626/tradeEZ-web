"use client";

import { createContext, type ReactNode, useContext } from "react";

const DisplayCurrencyContext = createContext("USD");

export function DisplayCurrencyProvider({
  currency,
  children,
}: {
  currency: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <DisplayCurrencyContext.Provider value={currency && currency !== "all" ? currency : "USD"}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency(): string {
  return useContext(DisplayCurrencyContext);
}
