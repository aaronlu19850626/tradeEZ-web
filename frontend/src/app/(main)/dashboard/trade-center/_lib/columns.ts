export type ViewMode = "day" | "week" | "all";

export type ColumnKey =
  | "date"
  | "closeTime"
  | "openTime"
  | "side"
  | "symbol"
  | "volume"
  | "entry"
  | "exit"
  | "slTp"
  | "net"
  | "rr"
  | "points"
  | "swap"
  | "commission"
  | "duration"
  | "account"
  | "strategy";

/** Table column order: fixed columns first, then the configurable ones. */
export const COLUMN_ORDER: ColumnKey[] = [
  "date",
  "closeTime",
  "openTime",
  "symbol",
  "side",
  "volume",
  "net",
  "entry",
  "exit",
  "rr",
  "points",
  "slTp",
  "swap",
  "commission",
  "duration",
  "account",
  "strategy",
];

/**
 * Always rendered and not configurable. "date" is fixed for the week/all views
 * and hidden in the day view because the groups are already days.
 */
export const FIXED_COLUMNS: ColumnKey[] = [
  "date",
  "closeTime",
  "openTime",
  "symbol",
  "side",
  "volume",
  "net",
  "entry",
  "exit",
];

/** Columns the column picker manages; each view keeps its own selection. */
export const OPTIONAL_COLUMNS: ColumnKey[] = COLUMN_ORDER.filter((key) => !FIXED_COLUMNS.includes(key));

/** Each view keeps its own configurable set, so the all view can show everything by default. */
export const DEFAULT_OPTIONAL_BY_VIEW: Record<ViewMode, ColumnKey[]> = {
  day: ["rr", "duration"],
  week: ["rr", "duration"],
  all: OPTIONAL_COLUMNS,
};

export const SORTABLE_COLUMNS: ColumnKey[] = COLUMN_ORDER.filter((key) => key !== "slTp" && key !== "strategy");
export const ALL_TABLE_MAX_HEIGHT = "max-h-[50dvh]";

// Palette approved from the tracking reference screenshots.
export const PROFIT_TEXT = "var(--profit)";
export const PROFIT_SOLID = "var(--profit-strong)";
export const LOSS_TEXT = "var(--loss)";
export const LOSS_SOLID = "var(--loss-strong)";
export const LINE_COLOR = "var(--primary)";
export const GRID_COLOR = "var(--border)";

export type ColumnAlign = "left" | "center" | "right";

/**
 * Column width and alignment. Text reads left, short identifiers center, and
 * every quantity right-aligns so digits line up between rows.
 */
export const COLUMN_META: Record<ColumnKey, { width: number; align: ColumnAlign }> = {
  date: { width: 96, align: "left" },
  closeTime: { width: 96, align: "center" },
  openTime: { width: 96, align: "center" },
  symbol: { width: 88, align: "center" },
  side: { width: 72, align: "center" },
  volume: { width: 80, align: "right" },
  net: { width: 100, align: "right" },
  slTp: { width: 164, align: "center" },
  entry: { width: 96, align: "right" },
  exit: { width: 96, align: "right" },
  rr: { width: 84, align: "right" },
  points: { width: 88, align: "right" },
  swap: { width: 88, align: "right" },
  commission: { width: 88, align: "right" },
  duration: { width: 96, align: "right" },
  account: { width: 160, align: "left" },
  strategy: { width: 96, align: "left" },
};

export function alignClass(align: ColumnAlign): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

/** The all view inlines the date into the time columns, so they need more room. */
export function columnWidth(key: ColumnKey, dateInline: boolean): number {
  if (dateInline && (key === "closeTime" || key === "openTime")) return 178;
  return COLUMN_META[key].width;
}

export function ariaSortState(
  active: boolean,
  dir: "asc" | "desc" | undefined,
): "ascending" | "descending" | undefined {
  if (!active) return undefined;
  return dir === "asc" ? "ascending" : "descending";
}
