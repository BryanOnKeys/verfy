/**
 * Only same-site paths under known prefixes may be used as a post-login
 * redirect, so `?next=https://evil.example` or `//evil.example` cannot turn
 * the sign-in page into an open redirect.
 */
const ALLOWED = [/^\/dashboard(\/[A-Za-z0-9/_-]*)?$/, /^\/settings$/, /^\/invite\/[0-9a-f]{64}$/, /^\/auth\/reset-password$/];

export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || typeof next !== "string" || next.length > 200) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || next.includes("://")) return fallback;
  const path = next.split(/[?#]/)[0] ?? "";
  return ALLOWED.some((re) => re.test(path)) ? path : fallback;
}
