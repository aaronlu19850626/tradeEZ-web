"use client";

import Link from "next/link";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useLocale } from "@/lib/i18n";
import { shellText } from "@/lib/shell-i18n";

export function TopbarBrand() {
  const locale = useLocale();
  const t = shellText[locale];

  return (
    <div className="flex min-w-0 items-center gap-3">
      <SidebarTrigger
        className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        aria-label={t.sidebarToggle}
        title={t.sidebarToggle}
      />
      <Link prefetch={false} href="/dashboard/account-center" className="flex shrink-0 items-center gap-2">
        <img src="/tradeez-logo.png" alt="" className="size-9 object-contain" />
        <span className="text-xl font-semibold">TradeEZ</span>
      </Link>
      <p className="ml-3 hidden min-w-0 truncate bg-gradient-to-r from-violet-200 via-sky-200 to-violet-300 bg-clip-text text-base font-semibold tracking-wider text-transparent lg:block">
        {t.slogan}
      </p>
    </div>
  );
}
