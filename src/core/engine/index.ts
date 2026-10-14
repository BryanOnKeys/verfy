import { createEngine } from "./atls-engine.mjs";
import patterns from "../../../atls-cli/src/atls/data/patterns.json";
import defaultPolicy from "../../../atls-cli/src/atls/data/default_policy.json";

export type { Action, CheckResult, Finding, Policy, ScanReport, Verdict } from "./atls-engine.mjs";

/**
 * The same deterministic engine the CLI uses (rules, scanner, canonical JSON).
 * Rule data comes from atls-cli/src/atls/data, so the web app and the CLI can
 * never disagree about a verdict.
 */
export const engine = createEngine(patterns, defaultPolicy);
export const DEFAULT_POLICY = defaultPolicy;
