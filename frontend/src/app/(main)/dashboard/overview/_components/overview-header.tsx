import type { DashboardText } from "@/lib/tradesync/dashboard-i18n";

export function OverviewHeader({ t }: { t: DashboardText }) {
  return (
    <header>
      <h1 className="font-semibold text-3xl tracking-tight">{t.title}</h1>
    </header>
  );
}
