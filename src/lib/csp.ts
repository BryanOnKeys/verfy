/**
 * Content-Security-Policy for HTML responses. Scripts and <style> elements need
 * the per-request nonce (Next.js applies it to its own scripts). Inline style
 * *attributes* are allowed (`style-src-attr`) because React renders a few
 * computed widths; they cannot run code.
 */
const TURNSTILE = "https://challenges.cloudflare.com";

export function buildCsp(nonce: string, opts: { dev: boolean; supabaseUrl?: string; captcha?: boolean }): string {
  const supabase = opts.supabaseUrl ? new URL(opts.supabaseUrl).origin : "";
  // Cloudflare Turnstile (optional CAPTCHA) loads one script and one iframe from its own origin
  const cf = opts.captcha ? [TURNSTILE] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...cf, ...(opts.dev ? ["'unsafe-eval'"] : [])],
    // next dev injects nonce-less <style> tags for its overlay; production keeps the nonce
    "style-src": opts.dev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(supabase ? [supabase] : []), ...cf, ...(opts.dev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...(supabase ? [supabase] : [])],
    "frame-ancestors": ["'none'"],
    "frame-src": cf.length ? cf : ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
