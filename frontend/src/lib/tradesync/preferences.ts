import { apiFetch } from "./api";

/** Namespace used by the trade-center page for its per-view column choice. */
export const COLUMN_PREFERENCE_NAMESPACE = "trade-center.columns";

export interface PreferenceRecord<T> {
  namespace: string;
  payload: T | null;
  updated_at: string | null;
}

export const preferencesApi = {
  read: <T>(namespace: string) => apiFetch<PreferenceRecord<T>>(`/preferences/${namespace}`),
  write: <T>(namespace: string, payload: T) =>
    apiFetch<PreferenceRecord<T>>(`/preferences/${namespace}`, {
      method: "PUT",
      body: JSON.stringify({ payload }),
    }),
};
