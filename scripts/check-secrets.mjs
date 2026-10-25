// Fail if anything that looks like a real secret is in the repository or in the
// browser bundle. Runs in CI next to gitleaks; this one has no dependencies.
//
//   node scripts/check-secrets.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "coverage", ".venv", "venv", "__pycache__", "test-results", "playwright-report"]);
const TEXT = /\.(m?[jt]sx?|cjs|json|md|sql|toml|ya?ml|py|css|html|txt|env|example|sh)$|^\.env/i;

const RULES = [
  ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ED25519 )?PRIVATE KEY-----/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ["JWT (possible service_role key)", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/],
  ["Stripe live key", /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Verfy device token", /\batd_[A-Za-z0-9_-]{43}\b/],
  ["Verfy enrollment code", /\batle_[0-9a-f]{64}\b/],
  ["Ed25519 secret in a Verfy key file", /"secret"\s*:\s*"[A-Za-z0-9_-]{43}"/],
];

// Test fixtures that deliberately contain fake secrets to prove the scanners catch them.
const ALLOW = [
  /^verfy-cli[\\/]tests[\\/]/,
  /^verfy-cli[\\/]examples[\\/]/,
  /^verfy-cli[\\/]src[\\/]verfy[\\/]data[\\/]patterns\.json$/,
  /^scripts[\\/]check-secrets\.mjs$/,
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (st.size < 2_000_000 && TEXT.test(name)) yield full;
  }
}

const findings = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (ALLOW.some((re) => re.test(rel))) continue;
  const text = readFileSync(file, "utf8");
  for (const [label, re] of RULES) {
    const m = re.exec(text);
    if (m) findings.push(`${rel}: ${label} (${m[0].slice(0, 12)}…)`);
  }
}

// The browser bundle must not contain server-only configuration.
const staticDir = path.join(ROOT, ".next", "static");
if (existsSync(staticDir)) {
  const secretValue = process.env.SUPABASE_SECRET_KEY;
  for (const file of walk(staticDir)) {
    const text = readFileSync(file, "utf8");
    if (/SUPABASE_SECRET_KEY|ATLS_IP_HASH_SALT|sb_secret_/.test(text) || (secretValue && text.includes(secretValue))) {
      findings.push(`${path.relative(ROOT, file)}: server-only configuration in the browser bundle`);
    }
  }
}

if (findings.length) {
  console.error("Possible secrets found:\n  " + findings.join("\n  "));
  process.exit(1);
}
console.log("OK  no secrets found" + (existsSync(staticDir) ? " (including the browser bundle)" : ""));
