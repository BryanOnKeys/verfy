import { createEngine } from "./verfy-engine.mjs";
import patterns from "../../../verfy-cli/src/verfy/data/patterns.json";
import defaultPolicy from "../../../verfy-cli/src/verfy/data/default_policy.json";

export type { Action, CheckResult, Finding, Policy, ScanReport, Verdict } from "./verfy-engine.mjs";

/**
 * The same deterministic engine the CLI uses (rules, scanner, canonical JSON).
 * Rule data comes from verfy-cli/src/verfy/data, so the web app and the CLI can
 * never disagree about a verdict.
 */
export const engine = createEngine(patterns, defaultPolicy);
export const DEFAULT_POLICY = defaultPolicy;
