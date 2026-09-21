"use client";

import { useEffect, useState } from "react";

export type Locale = "zh-CN" | "en-US";
export const DEFAULT_LOCALE: Locale = "zh-CN";
export const LOCALE_STORAGE_KEY = "tradeez-locale";
export const LOCALE_EVENT = "tradeez-locale-changed";

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const apply = (value: unknown) => {
      if (value === "zh-CN" || value === "en-US") setLocale(value);
    };
    apply(window.localStorage.getItem(LOCALE_STORAGE_KEY) ?? DEFAULT_LOCALE);
    const onChanged = (event: Event) => apply((event as CustomEvent).detail);
    window.addEventListener(LOCALE_EVENT, onChanged);
    return () => window.removeEventListener(LOCALE_EVENT, onChanged);
  }, []);

  return locale;
}
