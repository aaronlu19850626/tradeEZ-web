import {
  BarChart3,
  Calendar,
  Link2,
  ListOrdered,
  ScrollText,
  Server,
  LayoutDashboard,
  BookOpenCheck,
  Tags,
  Settings,
  Target,
  BellRing,
  type LucideIcon,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "交易工作台",
    items: [
      { id: "today", title: "今日总览", url: "/dashboard/today", icon: LayoutDashboard },
      { id: "accounts", title: "账号与 EA", url: "/dashboard/accounts", icon: Link2 },
      { id: "orders", title: "完整订单", url: "/dashboard/orders", icon: ListOrdered },
      { id: "reviews", title: "交易复盘", url: "/dashboard/reviews", icon: ScrollText },
      { id: "tags", title: "标签管理", url: "/dashboard/tags", icon: Tags },
      { id: "playbooks", title: "模型与规则", url: "/dashboard/playbooks", icon: BookOpenCheck },
      { id: "raw-deals", title: "原始成交", url: "/dashboard/raw-deals", icon: Server },
      { id: "sync-logs", title: "同步日志", url: "/dashboard/sync-logs", icon: ScrollText },
      { id: "analytics", title: "交易分析", url: "/dashboard/analytics", icon: BarChart3 },
      { id: "calendar", title: "交易日历", url: "/dashboard/calendar", icon: Calendar },
      { id: "settings", title: "工作区设置", url: "/dashboard/settings", icon: Settings },
      { id: "weekly", title: "周复盘与行动", url: "/dashboard/weekly", icon: Target },
      { id: "habits", title: "习惯与提醒", url: "/dashboard/habits", icon: BellRing },
    ],
  },
];
