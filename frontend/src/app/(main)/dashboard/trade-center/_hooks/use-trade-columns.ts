"use client";

import { useEffect, useMemo, useState } from "react";

import { COLUMN_PREFERENCE_NAMESPACE, preferencesApi } from "@/lib/tradesync/preferences";

import {
  COLUMN_ORDER,
  type ColumnKey,
  DEFAULT_OPTIONAL_BY_VIEW,
  FIXED_COLUMNS,
  OPTIONAL_COLUMNS,
  type ViewMode,
} from "../_lib/trade-center-model";

export function useTradeColumns(view: ViewMode) {
  const [optionalByView, setOptionalByView] = useState<Record<ViewMode, ColumnKey[]>>(() => ({
    day: [...DEFAULT_OPTIONAL_BY_VIEW.day],
    week: [...DEFAULT_OPTIONAL_BY_VIEW.week],
    all: [...DEFAULT_OPTIONAL_BY_VIEW.all],
  }));
  const [columnOpen, setColumnOpen] = useState(false);
  const optionalColumns = optionalByView[view];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await preferencesApi.read<Partial<Record<ViewMode, ColumnKey[]>>>(COLUMN_PREFERENCE_NAMESPACE);
        const payload = saved.payload;
        if (cancelled || !payload) return;
        setOptionalByView((prev) => {
          const next = { ...prev };
          for (const mode of ["day", "week", "all"] as ViewMode[]) {
            const value = payload[mode];
            if (Array.isArray(value)) next[mode] = value.filter((key) => OPTIONAL_COLUMNS.includes(key));
          }
          return next;
        });
      } catch {
        // Reading the preference is best-effort; defaults are already in place.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const viewColumns = useMemo(() => {
    const fixed = view === "week" ? FIXED_COLUMNS : FIXED_COLUMNS.filter((key) => key !== "date");
    return COLUMN_ORDER.filter((key) => fixed.includes(key) || optionalColumns.includes(key));
  }, [optionalColumns, view]);

  const applyColumns = (next: ColumnKey[]) => {
    setOptionalByView((prev) => ({ ...prev, [view]: next }));
    void preferencesApi.write(COLUMN_PREFERENCE_NAMESPACE, { ...optionalByView, [view]: next }).catch(() => undefined);
  };

  return {
    applyColumns,
    columnOpen,
    optionalColumns,
    setColumnOpen,
    viewColumns,
  };
}
