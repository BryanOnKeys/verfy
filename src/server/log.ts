import "server-only";

/**
 * Structured JSON logs (one line per event, read by Vercel's log drain).
 * Values under sensitive keys are replaced before anything is written, and
 * strings that look like tokens are masked, so secrets, raw device tokens and
 * tool arguments never reach the logs.
 */

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|code|signature|sig|body|args|arguments|public_key|email/i;
const TOKEN_LIKE = /\b(atd_[A-Za-z0-9_-]{8,}|atle_[0-9a-f]{8,}|sb_(secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (typeof value === "string") return value.replace(TOKEN_LIKE, "[REDACTED]").slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactForLog(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redactForLog(v, depth + 1);
    return out;
  }
  return value;
}

type Level = "info" | "warn" | "error";

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...(redactForLog(fields) as Record<string, unknown>) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
