import { API_BASE_URL, apiFetch, getToken } from "./api";

export interface AccountCenterItem {
  id: number;
  name: string | null;
  mt5_login: number | string;
  broker_server: string | null;
  currency: string | null;
  is_statistics: boolean;
  sync_start_date: string | null;
  status: string;
  balance: number | null;
  equity: number | null;
  snapshot_time: number | null;
  last_updated_at: number | null;
  heartbeat_at: number | null;
  ea_status: "online" | "offline";
  trade_count: number;
  key_prefix: string;
  key_environment: string;
  key_created_at: string | null;
  created_at: string;
}

export interface AccountCenterWithKey extends AccountCenterItem {
  sync_key: string;
  message: string;
}

export interface AccountCenterCreatePayload {
  name: string;
  mt5_login: string | number;
  broker_server?: string | null;
  sync_start_date: string;
}

export interface AccountCenterUpdatePayload {
  name?: string;
  is_statistics?: boolean;
}

export interface AccountCenterResetPayload {
  name: string;
  sync_start_date: string;
}

export interface AccountCenterReport {
  account: AccountCenterItem;
  report: null;
  message: string;
}

export interface AccountImportResult {
  batch_id: number;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  errors: { row_number: number; reason: string; raw_summary: string }[];
}

export const accountCenterApi = {
  list: () => apiFetch<AccountCenterItem[]>("/accounts"),
  get: (id: number) => apiFetch<AccountCenterItem>(`/accounts/${id}`),
  create: (payload: AccountCenterCreatePayload) =>
    apiFetch<AccountCenterWithKey>("/accounts", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: AccountCenterUpdatePayload) =>
    apiFetch<AccountCenterItem>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  syncKey: (id: number) => apiFetch<{ sync_key: string }>(`/accounts/${id}/sync-key`),
  regenerateKey: (id: number) => apiFetch<AccountCenterWithKey>(`/accounts/${id}/regenerate-key`, { method: "POST" }),
  resetSync: (id: number, payload: AccountCenterResetPayload) =>
    apiFetch<AccountCenterItem>(`/accounts/${id}/reset-sync`, { method: "POST", body: JSON.stringify(payload) }),
  delete: (id: number, payload: { name: string }) =>
    apiFetch<{ message: string }>(`/accounts/${id}`, { method: "DELETE", body: JSON.stringify(payload) }),
  report: (id: number) => apiFetch<AccountCenterReport>(`/accounts/${id}/report`),
};

export async function importAccountDeals(id: number, file: File): Promise<AccountImportResult> {
  const form = new FormData();
  form.append("file", file);
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/accounts/${id}/imports`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    cache: "no-store",
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = payload?.error ?? payload?.detail ?? {};
    throw new Error(typeof error === "string" ? error : (error.message ?? response.statusText));
  }
  return payload as AccountImportResult;
}
