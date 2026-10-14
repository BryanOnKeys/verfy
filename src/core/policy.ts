import { z } from "zod";
import { engine, type Action, type Policy, type Verdict } from "./engine";
import precheck from "../../atls-cli/tests/fixtures/precheck.json";

/**
 * Team policies: validation and the simulator that runs before a policy is
 * published (decision D-16: "simulator mandatory before activation").
 */

const verdict = z.enum(["allow", "ask", "deny"]);
const pattern = z
  .string()
  .min(1)
  .max(300)
  .refine((p) => {
    try {
      new RegExp(p);
      return true;
    } catch {
      return false;
    }
  }, "is not a valid regular expression")
  // reject nested quantifiers like (a+)+ that can take exponential time
  .refine((p) => !/\((?:[^()\\]|\\.)*[+*}]\)[+*{]/.test(p), "has a nested quantifier (risk of catastrophic backtracking)");
const glob = z.string().min(1).max(300);
const globs = z.array(glob).max(200);

export const policySchema = z
  .object({
    agent: z.string().max(80),
    on_ask: z.enum(["deny", "allow", "elicit"]),
    fail_mode: z.enum(["ask", "deny"]),
    hide_unsafe_tools: z.boolean(),
    disabled_rules: z.array(z.string().regex(/^ATL-[A-Z]+-\d{3}$/, "must be an Atls rule id like ATL-SH-006")).max(100),
    tools: z.object({ deny: globs, ask: globs, trust: globs }).partial().strict(),
    files: z
      .object({ sensitive: globs, deny_write: globs, allow_write: globs, outside_workspace: z.enum(["allow", "ask", "deny"]) })
      .partial()
      .strict(),
    network: z.object({ allow: globs, deny: globs, unknown: verdict }).partial().strict(),
    payments: z
      .object({
        max_per_call: z.number().nonnegative().max(1e9),
        ask_above: z.number().nonnegative().max(1e9),
        daily_budget: z.number().nonnegative().max(1e9),
        currencies: z.array(z.string().regex(/^[A-Za-z]{3}$/)).max(50),
        recipients: z.array(z.string().max(200)).max(500),
      })
      .partial()
      .strict(),
    rules: z
      .array(
        z
          .object({
            id: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
            pattern,
            flags: z.enum(["", "i"]).optional(),
            verdict,
            message: z.string().max(300).optional(),
            tool: glob.optional(),
            arg: z.string().max(200).optional(),
          })
          .strict(),
      )
      .max(200),
    receipts: z.object({ include_args: z.boolean() }).partial().strict(),
    lock: z.object({ on_new: z.enum(["ask", "deny", "allow"]) }).partial().strict(),
  })
  .partial()
  .strict();

export type TeamPolicy = z.infer<typeof policySchema>;

export const POLICY_MAX_BYTES = 64 * 1024;

export function validatePolicy(body: unknown): { ok: true; policy: TeamPolicy } | { ok: false; error: string } {
  const parsed = policySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "policy"}: ${issue?.message ?? "invalid"}` };
  }
  if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > POLICY_MAX_BYTES) return { ok: false, error: "policy is larger than 64 KB" };
  try {
    engine.loadPolicy({ ...parsed.data, ...SIM_BASE });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "policy cannot be loaded" };
  }
  return { ok: true, policy: parsed.data };
}

// ---------------------------------------------------------------- simulator

const SIM_BASE = { home: "/home/you", workspace: "/home/you/project" };

interface Case {
  name: string;
  action: Action;
}

/** The corpus: every fixture case that needs no special policy or context (the same fixtures both engines are tested on). */
export const CORPUS: Case[] = (precheck.cases as { name: string; action: Action; policy: object; context: object }[])
  .filter((c) => Object.keys(c.policy).length === 0 && Object.keys(c.context).length === 0)
  .map((c) => ({ name: c.name, action: c.action }));

function verdictOf(action: Action, policy: Policy) {
  const r = engine.check(action, policy);
  return { verdict: r.verdict, rules: [...new Set(r.findings.map((f) => f.rule))].sort() };
}

const defaults = engine.loadPolicy(SIM_BASE);
/** Actions that the default policy allows: everyday work such as `npm test`, `git status`, reading project files. */
export const SAFE_CASES = CORPUS.filter((c) => verdictOf(c.action, defaults).verdict === "allow");

export interface SimulationChange {
  name: string;
  tool: string;
  before: Verdict;
  after: Verdict;
  rules: string[];
}

export interface Simulation {
  total: number;
  counts: { before: Record<Verdict, number>; after: Record<Verdict, number> };
  changes: SimulationChange[];
  safe_total: number;
  safe_blocked: number;
  /** true when the proposed policy stops more than half of everyday actions */
  lockout: boolean;
  warnings: string[];
}

export function simulate(current: TeamPolicy, proposed: TeamPolicy, extra: Case[] = []): Simulation {
  const before = engine.loadPolicy({ ...current, ...SIM_BASE });
  const after = engine.loadPolicy({ ...proposed, ...SIM_BASE });
  const cases = [...CORPUS, ...extra];
  const zero = (): Record<Verdict, number> => ({ allow: 0, ask: 0, deny: 0 });
  const counts = { before: zero(), after: zero() };
  const changes: SimulationChange[] = [];
  for (const c of cases) {
    const b = verdictOf(c.action, before);
    const a = verdictOf(c.action, after);
    counts.before[b.verdict] += 1;
    counts.after[a.verdict] += 1;
    if (a.verdict !== b.verdict) changes.push({ name: c.name, tool: c.action.tool, before: b.verdict, after: a.verdict, rules: a.rules });
  }
  const safeBlocked = SAFE_CASES.filter((c) => verdictOf(c.action, after).verdict !== "allow").length;
  const warnings: string[] = [];
  const lockout = safeBlocked / SAFE_CASES.length > 0.5;
  if (lockout) warnings.push(`This policy stops ${safeBlocked} of ${SAFE_CASES.length} everyday actions (tests, git status, reading project files). Developers would be blocked from most work.`);
  else if (safeBlocked > 0) warnings.push(`${safeBlocked} of ${SAFE_CASES.length} everyday actions would need approval or be blocked.`);
  if (proposed.on_ask === "allow") warnings.push("on_ask is \"allow\": actions that need approval will run without asking (they are still recorded).");
  if (proposed.lock?.on_new === "allow") warnings.push("lock.on_new is \"allow\": tools added to a locked server run without review.");
  if ((proposed.disabled_rules ?? []).some((r) => /^ATL-(SH-001|FS-004|SEC-001|TOOL-00[34])$/.test(r))) warnings.push("A critical protection rule is disabled.");
  return { total: cases.length, counts, changes, safe_total: SAFE_CASES.length, safe_blocked: safeBlocked, lockout, warnings };
}
