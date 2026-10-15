/**
 * The first line of defence, in front of every page, Server Action and API route. It is pure and synchronous, so it
 * costs microseconds and never touches the database: floods, scanners and malformed requests are turned away before
 * they can make Verfy do any real work. The Postgres rate limits (src/server/ratelimit.ts) still apply afterwards and
 * are the ones that hold across instances; these in-memory windows are per server instance and exist to shed load.
 *
 * What this does not do: absorb a volumetric DDoS. That happens in front of the app, at the platform edge (Vercel's
 * network and Firewall); see deploy/vercel/README.md.
 */

export interface Verdict {
  ok: boolean;
  retryAfter: number;
}

/** A fixed-window counter per key, bounded in memory (oldest keys are evicted first). */
export class WindowLimiter {
  private readonly windows = new Map<string, { count: number; reset: number }>();

  constructor(
    readonly max: number,
    readonly windowMs: number,
    private readonly capacity = 20_000,
  ) {}

  hit(key: string, now = Date.now()): Verdict {
    let w = this.windows.get(key);
    if (!w || w.reset <= now) {
      if (!w && this.windows.size >= this.capacity) this.evict(now);
      w = { count: 0, reset: now + this.windowMs };
    }
    w.count += 1;
    // re-insert so the Map's order is least-recently-used first
    this.windows.delete(key);
    this.windows.set(key, w);
    return { ok: w.count <= this.max, retryAfter: Math.max(1, Math.ceil((w.reset - now) / 1000)) };
  }

  /** True when the key has already used its whole budget in the current window (does not count as a hit). */
  blocked(key: string, now = Date.now()): boolean {
    const w = this.windows.get(key);
    return !!w && w.reset > now && w.count >= this.max;
  }

  get size(): number {
    return this.windows.size;
  }

  private evict(now: number) {
    for (const [k, w] of this.windows) if (w.reset <= now) this.windows.delete(k);
    while (this.windows.size >= this.capacity) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}

/** Per-instance budgets. Generous for people and devices, far too small for a flood. */
export const SHIELD = {
  pages: new WindowLimiter(600, 60_000), // page and RSC requests per IP per minute
  actions: new WindowLimiter(40, 60_000), // Server Action POSTs (sign-in, sign-up...) per IP per minute
  api: new WindowLimiter(600, 60_000), // API requests per IP per minute
  badTokens: new WindowLimiter(20, 600_000), // failed device-token authentications per IP per 10 minutes
};

export const MAX_URL_LENGTH = 4096;
const PAGE_METHODS = new Set(["GET", "HEAD", "POST"]);
const API_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/**
 * Paths that only vulnerability scanners ask for (secrets, VCS folders, other platforms' admin pages). Verfy has none
 * of them, so they get a cheap 404 without session handling or rendering.
 */
const PROBE =
  /(^|\/)\.(env|git|svn|hg|aws|ssh|docker|npmrc|htaccess|htpasswd|ds_store)(\/|$|\.)|\.(php\d?|asp|aspx|jsp|cgi|pl|bak|sql|sqlite|ini|log)$|\/(wp-admin|wp-login|wp-content|wp-includes|wordpress|xmlrpc|phpmyadmin|pma|cgi-bin|vendor\/phpunit|actuator|server-status|boaform|hnap1)(\/|$)/i;

export function isProbe(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return true; // malformed percent-encoding: no legitimate client sends that
  }
  return PROBE.test(path);
}

export type Rejection = { status: 404 | 405 | 414 | 429; reason: string; retryAfter?: number };

/** Decide whether a request may continue. Returns null to let it through. */
export function screen(kind: "page" | "api", req: { method: string; url: string; pathname: string; ip: string }): Rejection | null {
  if (req.url.length > MAX_URL_LENGTH) return { status: 414, reason: "url_too_long" };
  const methods = kind === "api" ? API_METHODS : PAGE_METHODS;
  if (!methods.has(req.method)) return { status: 405, reason: "method_not_allowed" };
  if (isProbe(req.pathname)) return { status: 404, reason: "probe" };
  const limiter = kind === "api" ? SHIELD.api : req.method === "POST" ? SHIELD.actions : SHIELD.pages;
  const v = limiter.hit(req.ip);
  if (!v.ok) return { status: 429, reason: "flood", retryAfter: v.retryAfter };
  return null;
}

/**
 * The client's IP address, from headers the platform controls.
 *  - On Vercel, `x-real-ip` is set by Vercel's edge and cannot be supplied by the client.
 *  - Elsewhere, behind one trusted reverse proxy, the right-most `x-forwarded-for` entry is the address that proxy
 *    saw; entries further left were written by the client and are ignored.
 */
export function clientIp(headers: Headers, onVercel = process.env.VERCEL === "1"): string {
  const clean = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return /^[0-9a-fA-F:.]{2,45}$/.test(s) ? s : "";
  };
  if (onVercel) {
    const real = clean(headers.get("x-real-ip"));
    if (real) return real;
  }
  const parts = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => clean(p))
    .filter(Boolean);
  const fromProxy = onVercel ? parts[0] : parts[parts.length - 1];
  return fromProxy || clean(headers.get("x-real-ip")) || "unknown";
}
