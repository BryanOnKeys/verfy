import { describe, expect, it } from "vitest";
import { CORPUS, SAFE_CASES, simulate, validatePolicy } from "./policy";
import { can, PERMISSIONS, ROLES } from "./permissions";

describe("policy validation", () => {
  it("accepts the documented examples", () => {
    expect(validatePolicy({}).ok).toBe(true);
    expect(
      validatePolicy({
        on_ask: "elicit",
        tools: { deny: ["github/delete_*"], ask: ["merge_pull_request"] },
        network: { allow: ["github.com", "*.python.org"], unknown: "ask" },
        payments: { max_per_call: 50, ask_above: 10, daily_budget: 100 },
        rules: [{ id: "no-prod-db", pattern: "prod-db", verdict: "deny", message: "Production is off-limits." }],
        disabled_rules: ["ATL-SH-006"],
      }).ok,
    ).toBe(true);
  });

  it("rejects unknown keys, local paths, bad values and dangerous regexes", () => {
    for (const bad of [
      { home: "/root" },
      { workspace: "/x" },
      { on_ask: "maybe" },
      { fail_mode: "open" },
      { tools: { allow_everything: true } },
      { rules: [{ id: "x", pattern: "(", verdict: "deny" }] },
      { rules: [{ id: "x", pattern: "(a+)+$", verdict: "deny" }] },
      { disabled_rules: ["SH-1"] },
      { payments: { max_per_call: -1 } },
      [],
      "policy",
    ]) {
      expect(validatePolicy(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("policy simulator", () => {
  it("runs on the shared fixture corpus", () => {
    expect(CORPUS.length).toBeGreaterThan(50);
    expect(SAFE_CASES.length).toBeGreaterThan(10);
    const same = simulate({}, {});
    expect(same.changes).toEqual([]);
    expect(same.lockout).toBe(false);
  });

  it("flags a policy that would lock developers out", () => {
    const sim = simulate({}, { tools: { deny: ["*"] } });
    expect(sim.lockout).toBe(true);
    expect(sim.safe_blocked).toBe(sim.safe_total);
    expect(sim.counts.after.deny).toBe(sim.total);
  });

  it("shows what a targeted rule changes", () => {
    const sim = simulate({}, { rules: [{ id: "no-force", pattern: "--force|-f\\b", verdict: "deny" }] });
    expect(sim.lockout).toBe(false);
    expect(sim.changes.length).toBeGreaterThan(0);
    expect(sim.changes.every((c) => c.after === "deny" && c.rules.includes("no-force"))).toBe(true);
  });

  it("warns about weakening settings", () => {
    expect(simulate({}, { on_ask: "allow" }).warnings.join(" ")).toMatch(/without asking/);
    expect(simulate({}, { disabled_rules: ["ATL-SH-001"] }).warnings.join(" ")).toMatch(/critical protection/);
  });
});

describe("role matrix", () => {
  it("matches the database rules", () => {
    expect(can("auditor", "receipts.read")).toBe(true);
    expect(can("auditor", "policies.publish")).toBe(false);
    expect(can("auditor", "audit.read")).toBe(true);
    expect(can("member", "audit.read")).toBe(false);
    expect(can("member", "exports.create")).toBe(false);
    expect(can("admin", "devices.revoke")).toBe(true);
    expect(can(null, "receipts.read")).toBe(false);
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can("owner", p)).toBe(true);
    expect(ROLES).toEqual(["owner", "admin", "member", "auditor"]);
  });
});
