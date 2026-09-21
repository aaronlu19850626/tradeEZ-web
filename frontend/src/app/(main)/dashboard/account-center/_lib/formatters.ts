export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function formatMoney(value: number | null, currency: string | null, locale: string): string {
  if (value === null || value === undefined) return "N/A";
  const symbol = currency === "USD" ? "$" : currency ? `${currency} ` : "$";
  return `${symbol}${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUpdatedAt(epoch: number | null, locale: string): { date: string; time: string } | null {
  if (epoch === null || epoch === undefined) return null;
  const date = new Date(epoch * 1000);
  return {
    date: date.toLocaleDateString(locale),
    time: date.toLocaleTimeString(locale, { hour12: false }),
  };
}
