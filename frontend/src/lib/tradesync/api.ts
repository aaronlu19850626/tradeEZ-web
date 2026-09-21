export const TRADESYNC_TOKEN_KEY = "tradesync-access-token";
// Server-readable session cookie so the dashboard layout can redirect without
// relying on client-side JavaScript.
export const SESSION_COOKIE = "tradeez-session";

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value ?? fallback).replace(/\/$/, "");
}

export const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "http://127.0.0.1:8000/api/v1");

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

export function setSessionCookie(token: string) {
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const request = () =>
    fetch(`${API_BASE_URL}${path}`, {
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
      typeof error === "string"
        ? error
        : typeof error === "object" && error.message
          ? error.message
          : response.statusText,
    );
  }
  return payload as T;
}

export type LoginIdentity = { email: string; phone?: never } | { phone: string; email?: never };

export interface User {
  id: number;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_login_at?: string | null;
}

export const getAuthConfig = () => apiFetch<{ test_mode: boolean; phone_region: string }>("/auth/config");

export function sendLoginCode(identity: LoginIdentity) {
  return apiFetch<{ message: string; expires_in: number; cooldown_seconds: number }>("/auth/send-code", {
    method: "POST",
    body: JSON.stringify(identity),
  });
}

export function verifyLoginCode(identity: LoginIdentity, code: string) {
  return apiFetch<{ access_token: string; token_type: string; is_new_user: boolean; user: User }>("/auth/verify-code", {
    method: "POST",
    body: JSON.stringify({ ...identity, code }),
  });
}

export const api = {
  me: () => apiFetch<User>("/users/me"),
};
