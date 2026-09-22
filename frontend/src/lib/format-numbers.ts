const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  HKD: "HK$",
};

const COMPACT_THRESHOLD = 10000;

function currencyPrefix(currency: string | null | undefined): string {
  const code = currency?.trim().toUpperCase();
  if (!code) return CURRENCY_SYMBOLS.USD;
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

function signPrefix(value: number): string {
  return value < 0 ? "-" : "";
}

function formatMagnitude(value: number, locale: string, digits: number): string {
  return Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCompactMagnitude(value: number, locale: string): string {
  const abs = Math.abs(value);
  if (abs >= COMPACT_THRESHOLD) {
    return `${(abs / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}K`;
  }
  return abs.toLocaleString(locale, { maximumFractionDigits: 0 });
}

export function formatMoney(value: number, locale: string, currency = "USD"): string {
  return `${signPrefix(value)}${currencyPrefix(currency)}${formatMagnitude(value, locale, 2)}`;
}

/** Compact amount for metric cards, calendar cells and grouped summaries. */
export function formatMoneyStat(value: number, locale: string, currency = "USD"): string {
  return `${signPrefix(value)}${currencyPrefix(currency)}${formatCompactMagnitude(value, locale)}`;
}

/** Compact amount for chart ticks and other space-constrained labels. */
export function formatMoneyCompact(value: number, locale: string, currency = "USD"): string {
  return formatMoneyStat(value, locale, currency);
}

/** Rounded amount for chart axes when a compact suffix is not required. */
export function formatMoneyAxis(value: number, locale: string, currency = "USD"): string {
  return `${signPrefix(value)}${currencyPrefix(currency)}${Math.abs(value).toLocaleString(locale, {
    maximumFractionDigits: 0,
  })}`;
}

export function formatCount(value: number, locale: string): string {
  return formatCompactMagnitude(value, locale);
}

export function formatSigned(value: number, digits: number, locale: string): string {
  return `${signPrefix(value)}${formatMagnitude(value, locale, digits)}`;
}

export function formatPercent(value: number, locale: string, digits = 2): string {
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatPrice(value: number, locale: string): string {
  const digits = value >= 10 ? 2 : 5;
  return value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatVolume(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
