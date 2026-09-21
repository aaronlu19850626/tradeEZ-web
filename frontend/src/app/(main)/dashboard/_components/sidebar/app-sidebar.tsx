"use client";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/ui/sidebar";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";

import { TradeezNavUser } from "../tradesync/tradeez-nav-user";
import { NavMain } from "./nav-main";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      {...props}
      variant="sidebar"
      collapsible="icon"
      className="top-16! h-[calc(100svh-4rem)]! border-0! [&_[data-slot=sidebar-group]]:px-2 [&_[data-slot=sidebar-group]]:py-1.5 [&_[data-slot=sidebar-group-label]]:h-7 [&_[data-slot=sidebar-menu]]:gap-1 [&_[data-slot=sidebar-menu-button]]:h-9 [&_[data-slot=sidebar-menu-button]]:gap-2.5 [&_[data-slot=sidebar-menu-button]]:px-2.5 [&_[data-slot=sidebar-menu-button]]:text-sm [&_[data-slot=sidebar-menu-button]_svg]:size-[1.125rem] group-data-[collapsible=icon]:[&_[data-slot=sidebar-menu-button]]:mx-auto group-data-[collapsible=icon]:[&_[data-slot=sidebar-menu-button]]:justify-center"
    >
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <TradeezNavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
