import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";
import { WindowLimiter, clientIp, isProbe, screen } from "./shield";

describe("WindowLimiter", () => {
  it("allows the budget, refuses the rest, and starts again after the window", () => {
    const l = new WindowLimiter(3, 1000);
    expect([1, 2, 3].map(() => l.hit("a", 0).ok)).toEqual([true, true, true]);
    const over = l.hit("a", 10);
    expect(over.ok).toBe(false);
    expect(over.retryAfter).toBe(1);
    expect(l.hit("b", 10).ok).toBe(true); // other keys are independent
    expect(l.hit("a", 1000).ok).toBe(true); // new window
  });

  it("reports a spent budget without counting a hit", () => {
    const l = new WindowLimiter(2, 1000);
    l.hit("x", 0);
    expect(l.blocked("x", 1)).toBe(false);
    l.hit("x", 2);
    expect(l.blocked("x", 3)).toBe(true);
    expect(l.blocked("x", 1000)).toBe(false);
  });

  it("never holds more keys than its capacity", () => {
    const l = new WindowLimiter(5, 60_000, 100);
    for (let i = 0; i < 10_000; i++) l.hit(`ip-${i}`, i);
    expect(l.size).toBeLessThanOrEqual(100);
  });
});

describe("probes", () => {
  it.each(["/.env", "/.env.local", "/app/.git/config", "/wp-login.php", "/wp-admin/", "/index.php", "/phpmyadmin", "/%2e%65nv", "/backup.sql", "/%E0%A4%A"])(
    "refuses %s",
    (p) => expect(isProbe(p)).toBe(true),
  );
  it.each(["/", "/docs", "/features", "/auth/sign-in", "/.well-known/security.txt", "/icon.svg", "/apple-icon.png", "/advisories/ATLS-2025-0001"])(
    "lets %s through",
    (p) => expect(isProbe(p)).toBe(false),
  );
});

describe("screen", () => {
  const req = (over: Partial<{ method: string; url: string; pathname: string; ip: string }> = {}) => ({
    method: "GET",
    url: "https://atls.test/docs",
    pathname: "/docs",
    ip: "203.0.113.9",
    ...over,
  });

  it("refuses long URLs, odd methods and probes", () => {
    expect(screen("page", req({ url: "https://atls.test/" + "a".repeat(5000) }))?.status).toBe(414);
    expect(screen("page", req({ method: "TRACE" }))?.status).toBe(405);
    expect(screen("page", req({ method: "DELETE" }))?.status).toBe(405);
    expect(screen("api", req({ method: "DELETE", ip: "203.0.113.10" }))).toBeNull();
    expect(screen("page", req({ pathname: "/wp-login.php" }))?.status).toBe(404);
  });

  it("cuts off a flood of Server Action posts from one address", () => {
    const ip = "198.51.100.77";
    let first429 = -1;
    for (let i = 0; i < 100 && first429 < 0; i++) if (screen("page", req({ method: "POST", ip }))?.status === 429) first429 = i;
    expect(first429).toBe(40);
  });
});

describe("clientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("on Vercel trusts x-real-ip, which the edge sets", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "1.1.1.1, 203.0.113.5" }), true)).toBe("203.0.113.5");
  });

  it("elsewhere ignores client-written x-forwarded-for entries and uses the proxy's own", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.5" }), false)).toBe("203.0.113.5");
  });

  it("rejects values that are not addresses", () => {
    expect(clientIp(h({ "x-forwarded-for": "<script>, ../../etc" }), false)).toBe("unknown");
    expect(clientIp(h({}), false)).toBe("unknown");
  });
});

describe("CSP with the optional CAPTCHA", () => {
  it("allows Turnstile's script and frame only when enabled", () => {
    const off = buildCsp("n", { dev: false });
    expect(off).toContain("frame-src 'none'");
    expect(off).not.toContain("challenges.cloudflare.com");
    const on = buildCsp("n", { dev: false, captcha: true });
    expect(on).toContain("frame-src https://challenges.cloudflare.com");
    expect(on).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(on).toContain("frame-ancestors 'none'");
  });
});
