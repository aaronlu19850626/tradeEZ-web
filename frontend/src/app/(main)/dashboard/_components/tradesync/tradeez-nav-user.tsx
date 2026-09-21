"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { EllipsisVertical, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { ApiClientError, api, clearSessionCookie, clearToken, getToken, type User } from "@/lib/tradesync/api";

function emailInitial(email: string) {
  return email.trim().slice(0, 1).toUpperCase() || "U";
}

export function TradeezNavUser() {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/auth/v2/login");
      return;
    }
    let active = true;
    api
      .me()
      .then((result) => {
        if (active) setUser(result);
      })
      .catch((error) => {
        if (active && getToken() === token && error instanceof ApiClientError && error.status === 401) {
          clearToken();
          router.replace("/auth/v2/login");
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  function logout() {
    clearToken();
    clearSessionCookie();
    router.replace("/auth/v2/login");
    router.refresh();
  }

  const email = user?.phone ?? user?.email ?? "未登录";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{emailInitial(email)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">TradeEZ 用户</span>
                <span className="truncate text-muted-foreground text-xs">{email}</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{emailInitial(email)}</AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 text-left text-sm leading-tight">
                  <span className="truncate font-medium">TradeEZ 用户</span>
                  <span className="truncate text-muted-foreground text-xs">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
