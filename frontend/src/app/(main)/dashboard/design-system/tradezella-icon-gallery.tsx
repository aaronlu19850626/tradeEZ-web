"use client";

import { useMemo, useState } from "react";

import { TRADEZELLA_ICONS, TradeZellaIcon } from "@/components/icons/tradezella";
import { Input } from "@/components/ui/input";

export function TradeZellaIconGallery() {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? TRADEZELLA_ICONS.filter((icon) =>
          [icon.name, icon.label, icon.source.testid].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery),
        )
      : TRADEZELLA_ICONS;
    return filtered.reduce<Record<string, typeof filtered>>((result, icon) => {
      const group = icon.name.split(".")[0] ?? "legacy";
      result[group] ??= [];
      result[group].push(icon);
      return result;
    }, {});
  }, [query]);

  return (
    <div className="space-y-6">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索图标名称或来源标签" />
      {Object.entries(groups).map(([group, icons]) => (
        <section key={group} className="space-y-3">
          <h3 className="font-medium text-sm">{group}</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            {icons?.map((icon) => (
              <button
                key={icon.name}
                type="button"
                className="flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 text-left hover:bg-muted"
                title={`复制 ${icon.name}`}
                onClick={() => void navigator.clipboard.writeText(icon.name)}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <TradeZellaIcon name={icon.name} size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-xs">{icon.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {icon.label ?? icon.source.testid}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
