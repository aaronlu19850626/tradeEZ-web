import type { ReactNode } from "react";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { APP_CONFIG } from "@/config/app-config";

const capabilities = [
  { title: "同步握手确认", description: "批次、数量和游标逐项确认，避免订单漏传或重复。", icon: CheckCircle2 },
  { title: "事实数据只读", description: "原始成交完整保留，后续复盘以完整交易为单位。", icon: Clock3 },
  { title: "同步 Key 可控", description: "Key 仅展示一次，可随时重置并停用账号同步。", icon: ShieldCheck },
];

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main>
      <div className="grid h-dvh justify-center p-2 lg:grid-cols-2">
        <div className="relative order-2 hidden h-full overflow-hidden rounded-3xl bg-primary lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_38%)]" />
          <div className="absolute top-10 space-y-2 px-10 text-primary-foreground">
            <p className="text-sm tracking-[0.24em] text-primary-foreground/70">TRADEEZ</p>
            <h1 className="font-medium text-3xl">{APP_CONFIG.name}</h1>
            <p className="max-w-md text-sm text-primary-foreground/80">
              MT5 EA 订单同步、交易核对与复盘控制台，让每一笔交易都可追踪、可确认、可复盘。
            </p>
          </div>

          <div className="absolute bottom-10 left-10 right-10 grid gap-4">
            {capabilities.map((item) => (
              <div key={item.title} className="flex gap-3 rounded-2xl bg-primary-foreground/10 p-4 backdrop-blur-sm">
                <item.icon className="mt-0.5 size-5 shrink-0 text-primary-foreground" />
                <div>
                  <h2 className="font-medium text-primary-foreground text-sm">{item.title}</h2>
                  <p className="text-primary-foreground/75 text-xs leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative order-1 flex h-full">{children}</div>
      </div>
    </main>
  );
}