"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Locale = "zh-CN" | "en-US";

export function LanguageSwitcher() {
  const [locale, setLocale] = useState<Locale>("zh-CN");

  useEffect(() => {
    const saved = window.localStorage.getItem("tradeez-locale");
    if (saved === "en-US" || saved === "zh-CN") setLocale(saved);
  }, []);

  function toggleLocale() {
    const next = locale === "zh-CN" ? "en-US" : "zh-CN";
    setLocale(next);
    window.localStorage.setItem("tradeez-locale", next);
    document.documentElement.lang = next;
    window.dispatchEvent(new CustomEvent("tradeez-locale-changed", { detail: next }));
  }

  return <Button variant="outline" size="sm" className="h-9 min-h-9 px-3 text-sm" onClick={toggleLocale} aria-label={locale === "zh-CN" ? "切换为英文" : "Switch to Chinese"}>{locale === "zh-CN" ? "中 / EN" : "EN / 中"}</Button>;
}
