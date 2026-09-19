"use client";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/ui/sidebar";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { TradeezNavUser } from "../tradesync/tradeez-nav-user";
import { NavMain } from "./nav-main";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props} variant="sidebar" collapsible="icon" className="top-16! h-[calc(100svh-4rem)]! border-0! group-data-[collapsible=icon]:[&_[data-slot=sidebar-menu-button]]:mx-auto">
      <SidebarContent><NavMain items={sidebarItems} /></SidebarContent>
      <SidebarFooter><TradeezNavUser /></SidebarFooter>
    </Sidebar>
  );
}
