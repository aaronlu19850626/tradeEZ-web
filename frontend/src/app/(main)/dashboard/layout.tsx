import type { ReactNode } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageSwitcher } from "./_components/header/language-switcher";
import { GlobalMt5Status } from "./_components/tradesync/global-mt5-status";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      className="tradeez-shell h-svh min-h-0! overflow-hidden bg-sidebar pt-16"
      style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "4.5rem" } as React.CSSProperties}>
      <header className="tradeez-topbar fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-4 bg-sidebar px-4 text-sidebar-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="展开或收起侧栏" title="展开或收起侧栏" />
          <Link prefetch={false} href="/dashboard/today" className="flex shrink-0 items-center gap-2">
            <img src="/tradeez-logo.png" alt="" className="size-9 object-contain" />
            <span className="text-xl font-semibold">TradeEZ</span>
          </Link>
          <p className="ml-3 hidden min-w-0 truncate bg-gradient-to-r from-violet-200 via-sky-200 to-violet-300 bg-clip-text text-base font-semibold tracking-wider text-transparent lg:block">让复盘更简单，让进步看得见</p>
        </div>
        <div className="tradeez-topbar-controls flex shrink-0 items-center gap-2">
          <div className="hidden md:block"><GlobalMt5Status /></div>
          <LanguageSwitcher />
        </div>
      </header>
      <AppSidebar />
      <SidebarInset className="m-0! min-h-0 min-w-0 overflow-hidden rounded-none! rounded-tl-md! border-0 shadow-none">
        <div data-slot="dashboard-workspace" className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:px-10 xl:px-12">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
