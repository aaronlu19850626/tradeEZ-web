import type { Locale } from "@/lib/i18n";
import type { TradeCenterText } from "@/lib/tradesync/trade-center-i18n";
import { dayKeyToEpoch, shanghaiDayKey } from "@/lib/tradesync/trades-mock";

import { LOSS_TEXT, PROFIT_TEXT } from "./columns";

export function formatMoney(value: number, locale: Locale): string {
  const amount = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}$${amount}`;
}

export function formatMoneyCompact(value: number, locale: Locale): string {
  const amount = Math.abs(Math.round(value)).toLocaleString(locale, { maximumFractionDigits: 0 });
  return `${value < 0 ? "-" : ""}$${amount}`;
}

export function formatSigned(value: number, digits: number, locale: Locale): string {
  const text = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value < 0 ? "-" : ""}${text}`;
}

export function formatPercent(value: number, locale: Locale): string {
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatPrice(value: number, locale: Locale): string {
  const digits = value >= 10 ? 2 : 5;
  return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 10小时3分钟 / 24分钟34秒 / 45秒. */
export function formatDuration(seconds: number, t: TradeCenterText): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours >= 1) {
    return minutes > 0 ? `${hours}${t.hoursUnit}${minutes}${t.minutesUnit}` : `${hours}${t.hoursUnit}`;
  }
  if (minutes >= 1) {
    return secs > 0 ? `${minutes}${t.minutesUnit}${secs}${t.secondsUnit}` : `${minutes}${t.minutesUnit}`;
  }
  return `${secs}${t.secondsUnit}`;
}

export function toneClass(value: number): string {
  if (value > 0) return "text-profit";
  if (value < 0) return "text-loss";
  return "text-muted-foreground";
}

export function toneColor(value: number): string {
  if (value > 0) return PROFIT_TEXT;
  if (value < 0) return LOSS_TEXT;
  return "var(--muted-foreground)";
}

export function calendarNumberClass(net: number | undefined): string {
  if (net === undefined) return "text-foreground/70";
  if (net > 0) return "text-success";
  if (net < 0) return "text-danger";
  return "text-muted-foreground";
}

export function calendarCellTone(weekHovered: boolean): string {
  return weekHovered ? "bg-muted/50" : "";
}

export function weekDayCellTone(count: number, net: number): string {
  if (count === 0) return "bg-muted/40 text-muted-foreground disabled:opacity-100";
  return net >= 0
    ? "bg-profit-soft hover:border-profit-strong hover:bg-profit-soft"
    : "bg-loss-soft hover:border-loss-strong hover:bg-loss-soft";
}

export function formatClock(epoch: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(epoch * 1000));
}

/** 2026.09.20 06:40:25 / Sep 20, 2026 06:40:25 */
export function formatDateTime(epoch: number, locale: Locale): string {
  const [year, month, day] = shanghaiDayKey(epoch).split("-");
  if (locale === "zh-CN") {
    return `${year}.${month}.${day} ${formatClock(epoch, locale)}`;
  }
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(epoch * 1000));
  return `${date} ${formatClock(epoch, locale)}`;
}

export function dayKeyToDate(dayKey: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function dateToDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateToMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDayLabel(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dayKeyToEpoch(dayKey) * 1000));
}

export function formatDayLong(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dayKeyToEpoch(dayKey) * 1000));
}

/** 2026年09月10日 周五 */
export function formatDayHeader(dayKey: string, locale: Locale): string {
  const [year, month, day] = dayKey.split("-");
  const date = new Date(dayKeyToEpoch(dayKey) * 1000);
  if (locale === "zh-CN") {
    const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(date);
    return `${year}年${month}月${day}日 ${weekday}`;
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function formatShortDay(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dayKeyToEpoch(dayKey) * 1000));
}

export function formatWeekday(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", weekday: "short" }).format(
    new Date(dayKeyToEpoch(dayKey) * 1000),
  );
}

/** 周四 18日 / Thu 18 */
export function formatWeekdayDate(dayKey: string, locale: Locale): string {
  const weekday = formatWeekday(dayKey, locale);
  const day = Number(dayKey.slice(8, 10));
  return locale === "zh-CN" ? `${weekday} ${day}日` : `${weekday} ${day}`;
}

/** 2026年09月14日 - 09月20日 / Sep 14 - Sep 20, 2026 */
export function formatWeekRange(startKey: string, endKey: string, locale: Locale): string {
  if (locale === "zh-CN") {
    const [year, startMonth, startDay] = startKey.split("-");
    const [, endMonth, endDay] = endKey.split("-");
    return `${year}年${startMonth}月${startDay}日 - ${endMonth}月${endDay}日`;
  }
  const monthDay = (key: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", month: "short", day: "numeric" }).format(
      new Date(dayKeyToEpoch(key) * 1000),
    );
  const year = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", year: "numeric" }).format(
    new Date(dayKeyToEpoch(endKey) * 1000),
  );
  return `${monthDay(startKey)} - ${monthDay(endKey)}, ${year}`;
}
