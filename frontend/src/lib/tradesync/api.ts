import type { ReviewReflection } from "./reflection";

export const TRADESYNC_TOKEN_KEY = "tradesync-access-token";
export type Mt5Identifier = number | string;
export interface TradeReview {
  reflection: ReviewReflection;
  review_id: number | null;
  revision: number; source_hash: string; source_changed: boolean;
  status: "draft" | "reviewed"; notes: string; tags: string[]; updated_at: string | null;
}
export interface ReviewListItem {
  reflection: ReviewReflection;
  id: number; account_login: string; position_id: string; trade_id: number | null; symbol: string | null;
  status: "draft" | "reviewed"; notes: string; tags: string[]; source_changed: boolean; updated_at: string;
  setup_id: number | null; setup_name: string | null; playbook_version: number | null;
  evaluation_complete: boolean | null; execution_coverage: number | null; execution_score: number | null;
  execution_compliance: "compliant" | "violations" | "insufficient" | null; critical_failures: string[];
}
export interface ReviewVersion {
  revision: number; status: "draft" | "reviewed"; notes: string; tags: string[];
  reflection: ReviewReflection; created_at: string;
}
export interface PlaybookRule {
  key: string; name: string; description: string;
  group: "environment" | "location" | "trigger" | "invalidation" | "risk" | "management" | "exit" | "prohibited";
  checkpoint: "pre_trade" | "entry" | "in_trade" | "exit" | "review";
  answer_type: "boolean" | "number" | "choice" | "text";
  evaluation: "manual" | "deterministic"; critical: boolean; allow_na: boolean;
  weight: number; options: string[]; unit: string;
}
export interface PlaybookVersion {
  id: number; version: number; status: "draft" | "published"; revision: number;
  content: Record<string, string>; rules: PlaybookRule[];
  created_at: string; updated_at: string; published_at: string | null;
}
export interface Setup {
  id: number; name: string; description: string; symbols: string[]; directions: ("buy" | "sell")[];
  status: "active" | "disabled"; created_at: string; updated_at: string;
  draft: PlaybookVersion | null; latest_published: PlaybookVersion | null;
}
export interface RuleAnswer { rule_key: string; status: "pass" | "fail" | "unknown" | "na"; evidence: string; value: string; }
export interface ReviewEvaluation {
  id: number; playbook_version_id: number; revision: number; answers: RuleAnswer[]; complete: boolean;
  coverage: number | null; score: number | null; compliance: "compliant" | "violations" | "insufficient";
  critical_failures: string[]; updated_at: string; rules: PlaybookRule[];
}
export interface EvaluationChoice { id: number; setup_id: number; setup_name: string; version: number; active: boolean; rules: PlaybookRule[]; }
export interface PlanScenario { id: string; name: string; symbol: string; direction: "buy" | "sell" | "neutral"; playbook_version_id: number | null; area: string; confirmation: string; invalidation: string; exit_principle: string; session: string; }
export interface DayPlan {
  id: number; account_id: number; plan_date: string; timezone: string; mode: "trade" | "observe" | "rest";
  status: "draft" | "confirmed"; revision: number; self_state: string; market_view: string; events: string;
  risk_limit: string; stop_conditions: string; improvement_focus: string; waiting_condition: string; no_trade_reason: string;
  allowed_playbook_version_ids: number[]; scenarios: PlanScenario[]; first_confirmed_at: string | null;
  confirmed_at: string | null; confirmed_late: boolean; updated_at: string;
}
export type IntentionState = "watching" | "prepared" | "executed_unlinked" | "linked" | "abandoned" | "invalidated" | "expired";
export interface TradeIntention { id: number; account_id: number; day_plan_id: number | null; scenario_id: string | null; playbook_version_id: number | null; symbol: string; direction: "buy" | "sell"; state: IntentionState; entry_basis: string; risk_plan: string; linked_trade_id: number | null; linked_at: string | null; created_at: string; updated_at: string; events: { id: number; from_state: string | null; to_state: string; reason: string; source: string; created_at: string }[]; }
export interface IntentionCandidate { trade_id: number; symbol: string; direction: string; open_time: number | null; close_time: number | null; }
export interface DailySummary { deal_count: number; closed_trades: number; needs_review: number; net_pnl: number; reviewed: number; pending_reviews: number; setup_linked: number; violations: number; intentions: number; linked_intentions: number; trade_ids: number[]; }
export interface DailyReview { id: number | null; account_id: number | null; review_date: string | null; timezone: string; status: "draft" | "completed" | "needs_review"; revision: number; plan_difference: string; execution_review: string; keep_behavior: string; main_problem: string; next_action: string; no_new_action: boolean; data_reviewed: boolean; saved_summary: DailySummary | null; current_summary: DailySummary; source_changed: boolean; first_completed_at: string | null; completed_at: string | null; updated_at: string | null; }
export interface WorkspaceSettings { display_timezone: string; trading_day_start: string; default_session: string; revision: number; updated_at: string | null; }
export interface WeeklySummary { days_recorded: number; days_completed: number; closed_trades: number; reviewed: number; pending_reviews: number; net_pnl: number; violations: number; }
export interface WeeklyReview { id: number | null; week_start: string | null; status: "draft" | "completed" | "needs_review"; revision: number; achievements: string; recurring_problems: string; next_focus: string; current_summary: WeeklySummary; saved_summary: WeeklySummary | null; source_changed: boolean; completed_at: string | null; updated_at: string | null; }
export interface ImprovementAction { id: number; weekly_review_id: number | null; title: string; success_measure: string; target_date: string | null; status: "active" | "completed" | "abandoned"; outcome: string; revision: number; created_at: string; updated_at: string; }
export interface HabitSummary { start_date: string; end_date: string; calendar_days: number; plans: { recorded: number; confirmed: number; rate: number | null }; daily_reviews: { recorded: number; completed: number; rate: number | null }; trade_reviews: { total: number; completed: number; rate: number | null }; }
export interface Reminder { id: number; title: string; due_at: string | null; status: "open" | "done" | "snoozed"; snoozed_until: string | null; source_type: string; source_id: number | null; revision: number; created_at: string; updated_at: string; }
export interface AccountMaintenanceAudit { id: number; account_id: number | null; mt5_login: string; action: "reset" | "delete"; reason: string; sync_start_time: number | null; counts: Record<string, number>; created_at: string; }

export interface ReviewTag { name: string; review_count: number; }
export interface TagDefinition { id: number; name: string; group_name: string; status: "active" | "disabled"; revision: number; review_count: number; updated_at: string; }
export interface ReviewAttachment { id: number; review_id: number; size: number; width: number; height: number; created_at: string; }
export interface TagChange { source: string; target: string; account_id?: number; }
export interface TagChangePreview {
  source: string; target: string; account_id: number | null; revision: string;
  affected_reviews: number; affected_accounts: number; merged_reviews: number; target_reviews: number;
}

export interface PerformanceStats {
  count: number; wins: number; losses: number; breakeven: number; net_pnl: number;
  win_rate: number | null; profit_factor: number | null; payoff_ratio: number | null;
  average_pnl: number | null; max_drawdown: number;
}
export interface PerformanceDay extends PerformanceStats {
  date: string; cumulative_pnl: number;
  trades: { trade_id: number; symbol: string; direction: string; net_pnl: number }[];
}
export interface PerformanceReport {
  tag: string | null;
  review_status: "unwritten" | "draft" | "reviewed" | null;
  setup_id: number | null;
  execution_status: "unrated" | "compliant" | "violations" | "insufficient" | null;
  resync_pending: boolean;
  account_id: number; currency: string | null; start_date: string; end_date: string;
  excluded: { partial: number; needs_review: number }; summary: PerformanceStats;
  days: PerformanceDay[]; symbols: (PerformanceStats & { symbol: string })[];
  setups: (PerformanceStats & { setup: string; scored: number; average_score: number | null })[];
  sessions: (PerformanceStats & { name: string; trade_ids: number[] })[];
  tags: (PerformanceStats & { name: string; trade_ids: number[] })[];
  errors: (PerformanceStats & { name: string; trade_ids: number[] })[];
  executions: (PerformanceStats & { name: string; trade_ids: number[] })[];
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value ?? fallback).replace(/\/$/, "");
}

export const API_BASE_URL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  "http://127.0.0.1:8000/api/v1",
);

export const EA_API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_EA_API_BASE_URL, API_BASE_URL);

export function getEaServerOrigin(): string {
  if (typeof window !== "undefined" && window.location.hostname === "192.168.31.116") {
    return "http://192.168.31.116:8000";
  }
  try {
    return new URL(EA_API_BASE_URL).origin;
  } catch {
    return EA_API_BASE_URL;
  }
}

export type AccountStatus = "active" | "disabled";

export interface User {
  id: number;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_login_at?: string | null;
}

export interface Account {
  notes: string | null;
  config_revision: number;
  sync_start_locked: boolean;
  resync_pending: boolean;
  id: number;
  user_id: number;
  mt5_login: Mt5Identifier;
  label?: string | null;
  broker_server?: string | null;
  broker_company?: string | null;
  account_currency?: string | null;
  server_gmt_off?: number | null;
  server_timezone_name?: string | null;
  status: AccountStatus;
  sync_start_time: number;
  last_success_sync_at?: string | null;
  key_prefix: string;
  key_environment: string;
  key_created_at?: string | null;
  key_last_used_at?: string | null;
  last_seen_at?: string | null;
  created_at: string;
  last_sync_time: number;
  deal_count: number;
  synced_order_count: number;
  complete_trade_count: number;
  review_trade_count: number;
  reconciliation_untracked_count: number;
  reconciliation_open_count: number;
  reconciliation_investigating_count: number;
  reconciliation_resolved_count: number;
  latest_close_time?: number | null;
  latest_deal_time?: number | null;
  symbol_count: number;
  snapshot_count: number;
  settings_count: number;
  latest_snapshot_time?: number | null;
  latest_equity?: number | null;
  latest_settings_time?: number | null;
  sync_auth_error_active: boolean;
  sync_auth_error_code?: string | null;
  sync_auth_error_at?: string | null;
}

export interface AccountWithKey extends Account {
  sync_key: string;
  message: string;
}

export interface EaSettingsSnapshot {
  id: number;
  account_login: Mt5Identifier;
  snapshot_time: number;
  settings: Record<string, unknown>;
  group_count: number;
  key_count: number;
  received_at: string;
  content_hash?: string | null;
}


export interface SnapshotPoint {
  timestamp: number;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number | null;
}

export interface SnapshotSeries {
  account_id: number;
  currency: string | null;
  total: number;
  start_time: number | null;
  end_time: number | null;
  limit: number;
  items: SnapshotPoint[];
}

export interface SymbolSpec {
  symbol: string;
  digits: number;
  point: number;
  tick_size: number;
  tick_value: number;
  contract_size: number;
  currency_base: string | null;
  currency_profit: string | null;
  updated_at: string;
}


export interface SyncOverviewAccountRef {
  id: number;
  mt5_login: Mt5Identifier;
  label: string | null;
}

export interface SyncOverviewSignalAccount extends SyncOverviewAccountRef {
  last_sync_time: number | null;
  latest_close_time: number | null;
  last_seen_at: string | null;
  seconds_since_heartbeat: number | null;
  sync_auth_error_code: string | null;
  sync_auth_error_at: string | null;
}

export interface SyncOverview {
  generated_at: number;
  heartbeat_stale_after: number;
  accounts: { total: number; active: number; disabled: number; resync_pending: number };
  trades: {
    complete: number;
    partial: number;
    needs_review: number;
    reconciliation_untracked: number;
    reconciliation_open: number;
    reconciliation_investigating: number;
    reconciliation_resolved: number;
  };
  runs: { open: number; committed: number; expired: number; failed: number };
  cursor_uncommitted: SyncOverviewSignalAccount[];
  heartbeat_stale: SyncOverviewSignalAccount[];
  auth_errors: SyncOverviewSignalAccount[];
  resync_pending_accounts: SyncOverviewAccountRef[];
  disabled_accounts: SyncOverviewAccountRef[];
}

export interface OrderSummary {
  review_status: "unwritten" | "draft" | "reviewed";
  review_source_changed: boolean;
  setup_id: number | null;
  setup_name: string | null;
  playbook_version: number | null;
  evaluation_complete: boolean | null;
  execution_coverage: number | null;
  execution_score: number | null;
  execution_compliance: "compliant" | "violations" | "insufficient" | null;
  critical_failures: string[];
  reconciliation_case_state: "open" | "investigating" | "resolved" | null;
  reconciliation_resolution: "source_confirmed" | "awaiting_resync" | "not_a_trade" | null;
  reconciliation_note: string | null;
  reconciliation_updated_at: string | null;
  trade_id: number;
  anchor_ticket: Mt5Identifier;
  account_login: Mt5Identifier;
  position_id: Mt5Identifier;
  symbol: string;
  strategy: string;
  direction: "buy" | "sell" | "mixed" | "unknown";
  reconciliation_status: "complete" | "partial" | "needs_review";
  reconciliation_issues: string[];
  remaining_volume: number;
  volume_in: number;
  volume_out: number;
  open_price?: number | null;
  close_price?: number | null;
  sl_price?: number | null;
  tp_price?: number | null;
  swap_total: number;
  commission_total: number;
  net_pnl: number;
  open_time?: number | null;
  close_time?: number | null;
  hold_seconds?: number | null;
  is_closed: boolean;
  magic?: Mt5Identifier | null;
  comment?: string | null;
}

export interface RawDeal {
  id: number;
  account_login: Mt5Identifier;
  ticket: Mt5Identifier;
  position_id: Mt5Identifier;
  order_id: Mt5Identifier;
  symbol: string;
  entry: number;
  type: number;
  volume: number;
  price: number;
  sl_price: number;
  tp_price: number;
  profit: number;
  swap: number;
  commission: number;
  magic: Mt5Identifier;
  comment?: string | null;
  open_time: number;
  deal_time: number;
  received_at: string;
}

export interface TradeAllocation {
  deal_ticket: Mt5Identifier;
  role: string;
  volume: number;
  profit: number;
  swap: number;
  commission: number;
  method: string;
}

export interface TradeDetail {
  trade: OrderSummary;
  allocations: TradeAllocation[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiLog {
  id: number;
  created_at: string;
  account_id?: number | null;
  mt5_login?: Mt5Identifier | null;
  method: string;
  path: string;
  action: string;
  status_code: number;
  success: boolean;
  duration_ms: number;
  item_count?: number | null;
  sync_run_id?: number | null;
  batch_id?: string | null;
  inserted_count?: number | null;
  updated_count?: number | null;
  duplicated_count?: number | null;
  rejected_count?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  trace_id?: string | null;
}

export interface SyncRun {
  id: number;
  account_id: number;
  instance_id?: string | null;
  protocol_version: string;
  status: "open" | "committed" | "expired" | "failed";
  cursor_start: number;
  cursor_end?: number | null;
  expected_batch_count?: number | null;
  received_batch_count: number;
  expected_deal_count?: number | null;
  received_deal_count: number;
  inserted_count: number;
  updated_count: number;
  duplicated_count: number;
  rejected_count: number;
  checksum?: string | null;
  last_error?: string | null;
  started_at: string;
  committed_at?: string | null;
  finished_at?: string | null;
}

export interface SyncBatch {
  id: number;
  batch_id: string;
  batch_index: number;
  batch_count: number;
  item_count: number;
  inserted_count: number;
  updated_count: number;
  duplicated_count: number;
  rejected_count: number;
  status: string;
  retries: number;
  received_at: string;
}

export interface SyncRunDetail {
  run: SyncRun;
  batches: SyncBatch[];
  total: number;
  page: number;
  page_size: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  server_timezone_name?: string | null;
  account_currency?: string | null;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TRADESYNC_TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TRADESYNC_TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TRADESYNC_TOKEN_KEY);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const base = API_BASE_URL;
  const request = () => fetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  let response: Response;
  try {
    response = await request();
  } catch (error) {
    // The local/LAN preview can briefly drop one of several parallel reads while
    // the EA is also synchronizing. Retrying only idempotent reads avoids double writes.
    if ((init?.method ?? "GET").toUpperCase() !== "GET") throw error;
    response = await request();
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = payload?.error ?? payload?.detail ?? {};
    throw new ApiClientError(
      response.status,
      typeof error === "object" && error.code ? error.code : "REQUEST_FAILED",
      typeof error === "string" ? error : typeof error === "object" && error.message ? error.message : response.statusText,
    );
  }
  return payload as T;
}

export type LoginIdentity = { email: string; phone?: never } | { phone: string; email?: never };

export const getAuthConfig = () => apiFetch<{ test_mode: boolean; phone_region: string }>("/auth/config");

export async function sendLoginCode(identity: LoginIdentity) {
  return apiFetch<{ message: string; expires_in: number; cooldown_seconds: number }>("/auth/send-code", {
    method: "POST",
    body: JSON.stringify(identity),
  });
}

export interface TradeReconciliation {
  state: "open" | "investigating" | "resolved";
  resolution: "source_confirmed" | "awaiting_resync" | "not_a_trade" | null;
  note: string;
  updated_at: string | null;
  events: { state: string; resolution: string | null; note: string; created_at: string }[];
}

export async function attachmentBlob(id: number): Promise<Blob> {
  const base = API_BASE_URL;
  const token = getToken();
  const response = await fetch(`${base}/my/review-attachments/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "附件不存在或无权访问" : "截图读取失败，请重试");
  return response.blob();
}

export async function performanceCsv(params: URLSearchParams): Promise<Blob> {
  const base = API_BASE_URL;
  const token = getToken();
  const response = await fetch(`${base}/my/performance/export?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!response.ok) throw new Error("交易分析导出失败，请重试");
  return response.blob();
}

export async function verifyLoginCode(identity: LoginIdentity, code: string) {
  return apiFetch<{ access_token: string; token_type: string; is_new_user: boolean; user: User }>(
    "/auth/verify-code",
    { method: "POST", body: JSON.stringify({ ...identity, code }) },
  );
}

export const api = {
  workspaceSettings: () => apiFetch<WorkspaceSettings>("/my/workspace-settings"),
  saveWorkspaceSettings: (payload: Record<string, unknown>) => apiFetch<WorkspaceSettings>("/my/workspace-settings", { method: "PUT", body: JSON.stringify(payload) }),
  weeklyReview: (weekStart: string) => apiFetch<WeeklyReview>(`/my/weekly-review?week_start=${weekStart}`),
  saveWeeklyReview: (payload: Record<string, unknown>, complete = false) => apiFetch<WeeklyReview>(`/my/weekly-review?complete=${complete}`, { method: "PUT", body: JSON.stringify(payload) }),
  improvementActions: (status = "") => apiFetch<ImprovementAction[]>(`/my/improvement-actions${status ? `?status=${status}` : ""}`),
  createImprovementAction: (payload: Record<string, unknown>) => apiFetch<ImprovementAction>("/my/improvement-actions", { method: "POST", body: JSON.stringify(payload) }),
  updateImprovementAction: (id: number, payload: Record<string, unknown>) => apiFetch<ImprovementAction>(`/my/improvement-actions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  habitSummary: (start: string, end: string) => apiFetch<HabitSummary>(`/my/habit-summary?start_date=${start}&end_date=${end}`),
  reminders: () => apiFetch<Reminder[]>("/my/reminders"),
  createReminder: (payload: Record<string, unknown>) => apiFetch<Reminder>("/my/reminders", { method: "POST", body: JSON.stringify(payload) }),
  updateReminder: (id: number, payload: Record<string, unknown>) => apiFetch<Reminder>(`/my/reminders/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  dayPlan: (accountId: number, date: string) => apiFetch<DayPlan | null>(`/my/day-plan?account_id=${accountId}&plan_date=${date}`),
  saveDayPlan: (payload: Record<string, unknown>) => apiFetch<DayPlan>("/my/day-plan", { method: "PUT", body: JSON.stringify(payload) }),
  confirmDayPlan: (id: number, revision: number) => apiFetch<DayPlan>(`/my/day-plans/${id}/confirm?expected_revision=${revision}`, { method: "POST" }),
  intentions: (accountId: number, date: string) => apiFetch<{ plan_id: number | null; scenarios: PlanScenario[]; items: TradeIntention[] }>(`/my/intentions?account_id=${accountId}&plan_date=${date}`),
  createIntention: (payload: Record<string, unknown>) => apiFetch<TradeIntention>("/my/intentions", { method: "POST", body: JSON.stringify(payload) }),
  transitionIntention: (id: number, state: IntentionState, reason = "") => apiFetch<TradeIntention>(`/my/intentions/${id}/transition`, { method: "POST", body: JSON.stringify({ state, reason }) }),
  intentionCandidates: (id: number) => apiFetch<IntentionCandidate[]>(`/my/intentions/${id}/candidates`),
  linkIntention: (id: number, tradeId: number) => apiFetch<TradeIntention>(`/my/intentions/${id}/link`, { method: "POST", body: JSON.stringify({ trade_id: tradeId }) }),
  dailyReview: (accountId: number, date: string, timezone = "Asia/Shanghai") => apiFetch<DailyReview>(`/my/daily-review?account_id=${accountId}&review_date=${date}&timezone=${encodeURIComponent(timezone)}`),
  saveDailyReview: (payload: Record<string, unknown>, complete = false) => apiFetch<DailyReview>(`/my/daily-review?complete=${complete}`, { method: "PUT", body: JSON.stringify(payload) }),
  setups: () => apiFetch<Setup[]>("/my/setups"),
  createSetup: (payload: Record<string, unknown>) => apiFetch<Setup>("/my/setups", { method: "POST", body: JSON.stringify(payload) }),
  updateSetup: (id: number, payload: Record<string, unknown>) => apiFetch<Setup>(`/my/setups/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  createPlaybookDraft: (id: number) => apiFetch<PlaybookVersion>(`/my/setups/${id}/draft`, { method: "POST" }),
  savePlaybookDraft: (id: number, payload: Record<string, unknown>) => apiFetch<PlaybookVersion>(`/my/playbook-versions/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  publishPlaybook: (id: number, revision: number) => apiFetch<PlaybookVersion>(`/my/playbook-versions/${id}/publish?expected_revision=${revision}`, { method: "POST" }),
  reviewEvaluation: (id: number) => apiFetch<{ evaluation: ReviewEvaluation | null; choices: EvaluationChoice[] }>(`/my/reviews/${id}/evaluation`),
  saveReviewEvaluation: (id: number, payload: Record<string, unknown>) => apiFetch<ReviewEvaluation>(`/my/reviews/${id}/evaluation`, { method: "PUT", body: JSON.stringify(payload) }),
  tradeReview: (id: number) => apiFetch<TradeReview>(`/my/trades/${id}/review`),
  saveTradeReview: (id: number, payload: Omit<TradeReview, "updated_at" | "source_changed" | "review_id">) => apiFetch<{ review_id: number; revision: number; message: string }>(`/my/trades/${id}/review`, { method: "PUT", body: JSON.stringify(payload) }),
  reviewVersions: (id: number, page = 1) => apiFetch<Page<ReviewVersion>>(`/my/trades/${id}/review/versions?page=${page}&page_size=10`),
  reviewAttachments: (id: number) => apiFetch<ReviewAttachment[]>(`/my/reviews/${id}/attachments`),
  uploadAttachment: (id: number, file: File) => apiFetch<ReviewAttachment>(`/my/reviews/${id}/attachments`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file }),
  deleteAttachment: (id: number) => apiFetch<{ message: string }>(`/my/review-attachments/${id}`, { method: "DELETE" }),
  previewTagChange: (payload: TagChange) => apiFetch<TagChangePreview>("/my/review-tags/change-preview", { method: "POST", body: JSON.stringify(payload) }),
  applyTagChange: (payload: TagChange & { revision: string }) => apiFetch<{ updated_reviews: number; message: string }>("/my/review-tags/change", { method: "POST", body: JSON.stringify(payload) }),
  tagDefinitions: () => apiFetch<TagDefinition[]>("/my/tag-definitions"),
  updateTagDefinition: (id: number, payload: Record<string, unknown>) => apiFetch<TagDefinition>(`/my/tag-definitions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  bulkReviewTags: (payload: Record<string, unknown>) => apiFetch<{ updated_reviews: number; requested_reviews: number }>("/my/review-tags/bulk", { method: "POST", body: JSON.stringify(payload) }),
  reviews: (page: number, filters: { account_id?: string; status?: string; tag?: string; q?: string; association?: string; emotion?: string; primary_error?: string } = {}) => {
    const params = new URLSearchParams({ page: String(page), page_size: "30" });
    for (const [key, value] of Object.entries(filters)) if (value?.trim()) params.set(key, value.trim());
    return apiFetch<Page<ReviewListItem>>(`/my/reviews?${params}`);
  },
  reviewTags: (page: number, q = "", accountId = "") => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (accountId) params.set("account_id", accountId);
    return apiFetch<Page<ReviewTag>>(`/my/review-tags?${params}`);
  },
  maintenancePreview: (id: number) => apiFetch<{ mt5_login: string; revision: string; counts: Record<string, number> }>(`/accounts/${id}/maintenance-preview`),
  maintenanceAudits: (limit = 20) => apiFetch<AccountMaintenanceAudit[]>(`/my/account-maintenance-audits?limit=${limit}`),
  resetSync: (id: number, payload: Record<string, unknown>) => apiFetch<AccountWithKey>(`/accounts/${id}/reset-sync`, { method: "POST", body: JSON.stringify(payload) }),
  deleteAccount: (id: number, payload: Record<string, unknown>) => apiFetch<{ message: string }>(`/accounts/${id}`, { method: "DELETE", body: JSON.stringify(payload) }),
  me: () => apiFetch<User>("/users/me"),
  accounts: () => apiFetch<Account[]>("/accounts"),
  account: (id: number) => apiFetch<Account>(`/accounts/${id}`),
  performance: (params: URLSearchParams) => apiFetch<PerformanceReport>(`/my/performance?${params}`),
  createAccount: (payload: Record<string, unknown>) =>
    apiFetch<AccountWithKey>("/accounts", { method: "POST", body: JSON.stringify(payload) }),
  updateAccount: (id: number, payload: Record<string, unknown>) =>
    apiFetch<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  regenerateKey: (id: number) =>
    apiFetch<AccountWithKey>(`/accounts/${id}/regenerate-key`, { method: "POST" }),
  accountSettings: (id: number, limit = 5) =>
    apiFetch<EaSettingsSnapshot[]>(`/my/accounts/${id}/settings?limit=${limit}`),
  accountSnapshots: (
    id: number,
    params?: { start_time?: number; end_time?: number; limit?: number },
  ) => {
    const search = new URLSearchParams();
    if (params?.start_time !== undefined) search.set("start_time", String(params.start_time));
    if (params?.end_time !== undefined) search.set("end_time", String(params.end_time));
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    const query = search.toString();
    return apiFetch<SnapshotSeries>(`/my/accounts/${id}/snapshots${query ? `?${query}` : ""}`);
  },
  accountSymbols: (id: number, params?: { q?: string; page?: number; page_size?: number }) => {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.page_size !== undefined) search.set("page_size", String(params.page_size));
    const query = search.toString();
    return apiFetch<Page<SymbolSpec>>(`/my/accounts/${id}/symbols${query ? `?${query}` : ""}`);
  },
  orders: (params: URLSearchParams) => apiFetch<Page<OrderSummary>>(`/my/orders?${params.toString()}`),
  tradeDetail: (id: number, page = 1) => apiFetch<TradeDetail>(`/my/trades/${id}?page=${page}&page_size=30`),
  tradeReconciliation: (id: number) => apiFetch<TradeReconciliation>(`/my/trades/${id}/reconciliation`),
  saveTradeReconciliation: (id: number, payload: { state: string; resolution: string | null; note: string }) =>
    apiFetch<TradeReconciliation>(`/my/trades/${id}/reconciliation`, { method: "PUT", body: JSON.stringify(payload) }),
  rawDeals: (params: URLSearchParams) => apiFetch<Page<RawDeal>>(`/my/raw-deals?${params.toString()}`),
  syncRuns: (params: URLSearchParams) => apiFetch<Page<SyncRun>>(`/my/sync-runs?${params.toString()}`),
  syncRunDetail: (id: number, page = 1) =>
    apiFetch<SyncRunDetail>(`/my/sync-runs/${id}?page=${page}&page_size=20`),
  logs: (params: URLSearchParams) => apiFetch<ApiLog[]>(`/my/api-logs?${params.toString()}`),
  syncOverview: (heartbeatStaleAfter?: number) => {
    const query = heartbeatStaleAfter !== undefined
      ? `?heartbeat_stale_after=${heartbeatStaleAfter}`
      : "";
    return apiFetch<SyncOverview>(`/my/sync-overview${query}`);
  },
};

export function formatHold(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatNumber(value?: number | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPrice(value?: number | null): string {
  if (!value) return "—";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 10 });
}

export function formatUnix(value?: number | null): string {
  if (!value) return "—";
  return new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

