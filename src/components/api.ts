"use client";

/** JSON calls to the Atls API from the dashboard. Errors come back as RFC 9457 problems. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  problem?: Record<string, unknown>;
}

export async function api<T = unknown>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.status === 204) return { ok: true, status: 204 };
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, data: json as T };
    const problem = (json ?? {}) as Record<string, unknown>;
    const msg = [problem.title, problem.detail].filter(Boolean).join(" ");
    return { ok: false, status: res.status, error: msg || `Request failed (${res.status}).`, problem };
  } catch {
    return { ok: false, status: 0, error: "Network error. Check your connection and try again." };
  }
}
