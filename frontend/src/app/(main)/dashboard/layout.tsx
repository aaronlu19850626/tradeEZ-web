import type { ReactNode } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SESSION_COOKIE } from "@/lib/tradesync/api";

import { LanguageSwitcher } from "./_components/header/language-switcher";
import { ThemeSwitcher } from "./_components/header/theme-switcher";
import { TopbarBrand } from "./_components/header/topbar-brand";
import { GlobalMt5Status } from "./_components/tradesync/global-mt5-status";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  if (!cookieStore.get(SESSION_COOKIE)?.value) {
    redirect("/auth/v2/login");
  }
  return (
    <SidebarProvider
      defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      className="tradeez-shell h-svh min-h-0! overflow-hidden bg-sidebar pt-16"
      style={{ "--sidebar-width": "12.25rem", "--sidebar-width-icon": "4.5rem" } as React.CSSProperties}
    >
      <header className="tradeez-topbar fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-4 bg-sidebar px-4 text-sidebar-foreground">
        <TopbarBrand />
        <div className="tradeez-topbar-controls flex shrink-0 items-center gap-2">
          <div className="hidden md:block">
            <GlobalMt5Status />
          </div>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </header>
      <AppSidebar />
      <SidebarInset className="m-0! min-h-0 min-w-0 overflow-hidden rounded-none! rounded-tl-md! border-0 shadow-none">
        <div
          data-slot="dashboard-workspace"
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:px-10 xl:px-12"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
