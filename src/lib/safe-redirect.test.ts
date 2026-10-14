import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";
import { buildCsp } from "./csp";

describe("safeNext", () => {
  it("keeps known in-app paths", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/dashboard/receipts")).toBe("/dashboard/receipts");
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("/invite/" + "a".repeat(64))).toBe("/invite/" + "a".repeat(64));
    expect(safeNext("/dashboard/receipts?verdict=deny")).toBe("/dashboard/receipts");
  });

  it("refuses open redirects and unknown paths", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/dashboard/../../x", "javascript:alert(1)", "/api/v1/receipts", "", null, undefined, "/" + "a".repeat(300)]) {
      expect(safeNext(bad as string)).toBe("/dashboard");
    }
  });
});

describe("CSP", () => {
  it("uses the nonce, forbids framing and plugins, and only allows eval in development", () => {
    const prod = buildCsp("abc", { dev: false, supabaseUrl: "https://x.supabase.co" });
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("connect-src 'self' https://x.supabase.co");
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).toContain("style-src 'self' 'nonce-abc'");
    expect(prod).toContain("upgrade-insecure-requests");
    expect(buildCsp("abc", { dev: true })).toContain("'unsafe-eval'");
  });
});
