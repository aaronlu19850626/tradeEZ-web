import { EA_GROUP_LABELS, EA_SETTING_LABELS } from "./ea-settings-labels";

function displayValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (value === null || value === undefined || value === "") return "未设置";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function EaSettingsView({ settings, search }: { settings: Record<string, unknown>; search: string }) {
  const query = search.trim().toLowerCase();
  const groups = Object.entries(settings).flatMap(([group, value]) => {
    const groupLabel = EA_GROUP_LABELS[group] ?? "其他配置";
    const entries = value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value)
      : [[group, value] as const];
    const rows = entries.map(([key, item]) => {
      const metadata = EA_SETTING_LABELS[`${group}.${key}`];
      return { key, label: metadata?.label ?? "扩展参数", parameter: metadata?.parameter ?? key, value: displayValue(item) };
    }).filter((row) => `${groupLabel} ${group} ${row.label} ${row.parameter} ${row.key} ${row.value}`.toLowerCase().includes(query));
    return rows.length ? [{ group, groupLabel, rows }] : [];
  });

  if (!groups.length) return <p className="py-3 text-muted-foreground text-sm">没有匹配的参数</p>;

  return <div className="flex flex-col gap-4">
    {groups.map(({ group, groupLabel, rows }) => <section key={group} className="rounded-lg border p-3">
      <h3 className="mb-2 font-medium text-sm">{groupLabel} <span className="font-normal text-muted-foreground text-xs">{group}</span></h3>
      <dl className="divide-y">
        {rows.map((row) => <div key={row.key} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:gap-3">
          <dt className="min-w-0 text-sm">{row.label}<span className="block break-all font-mono text-muted-foreground text-xs">{row.parameter}</span></dt>
          <dd className="min-w-0 break-all text-sm sm:text-right">{row.value}</dd>
        </div>)}
      </dl>
    </section>)}
  </div>;
}
