import { Bot, CandlestickChart, LayoutDashboard, LineChart, Link2, type LucideIcon, Play } from "lucide-react";

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
      { id: "overview", title: "总览", url: "/dashboard/overview", icon: LayoutDashboard },
      { id: "accounts", title: "交易账户", url: "/dashboard/account-center", icon: Link2 },
      { id: "trades", title: "交易记录", url: "/dashboard/trade-center", icon: CandlestickChart },
      { id: "ai", title: "AI 中心", url: "/dashboard/ai-settings", icon: Bot },
      { id: "replay", title: "行情回放", url: "/dashboard/replay", icon: Play },
      { id: "chart-lab", title: "图表实验室", url: "/dashboard/chart-lab", icon: LineChart },
    ],
  },
];
