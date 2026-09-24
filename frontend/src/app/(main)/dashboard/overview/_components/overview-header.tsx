import type { ReactNode } from "react";

import type { DashboardText } from "@/lib/tradesync/dashboard-i18n";

import { StickyPageHeader } from "../../_components/sticky-page-header";

export function OverviewHeader({ t, notice }: { t: DashboardText; notice?: ReactNode }) {
  return (
    <StickyPageHeader flush showStuckBorder={false} className="overview-page-header">
      <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
      {notice ? (
        <div className="pointer-events-none absolute top-3 left-1/2 z-50 -translate-x-1/2">{notice}</div>
      ) : null}
    </StickyPageHeader>
  );
}
