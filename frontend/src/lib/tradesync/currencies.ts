export interface TradingCurrency {
  value: string;
  label: string;
  symbol: string;
  flag: string;
}

export const TRADING_CURRENCIES: TradingCurrency[] = [
  { value: "USD", label: "USD", symbol: "$", flag: "🇺🇸" },
  { value: "CNY", label: "CNY", symbol: "¥", flag: "🇨🇳" },
  { value: "EUR", label: "EUR", symbol: "€", flag: "🇪🇺" },
  { value: "GBP", label: "GBP", symbol: "£", flag: "🇬🇧" },
  { value: "JPY", label: "JPY", symbol: "¥", flag: "🇯🇵" },
  { value: "HKD", label: "HKD", symbol: "HK$", flag: "🇭🇰" },
];

export function findCurrency(value: string): TradingCurrency {
  return TRADING_CURRENCIES.find((currency) => currency.value === value) ?? TRADING_CURRENCIES[0];
}

export function defaultCurrencyForPlatform(platform: string): string {
  return platform === "ctp" ? "CNY" : "USD";
}
