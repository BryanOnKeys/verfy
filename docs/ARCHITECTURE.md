# Architecture

Atls has two halves that never depend on each other at decision time:

```
 developer machine / CI runner                               Atls Team (your Vercel + Supabase)
┌───────────────────────────────────────────┐              ┌──────────────────────────────────────────────┐
│ coding agent (Claude Code, Cursor, …)     │              │ Next.js 16 App Router on Vercel (Node.js)    │
│      │ tool call                          │              │  ├─ public site, docs, advisories            │
│      ▼                                    │              │  ├─ dashboard (Server Components)            │
│ atls hook pre-tool-use  /  atls proxy   │   atls sync │  └─ /api/v1 Route Handlers                   │
│  ├─ policy check (deterministic rules)    │ ───HTTPS───▶ │        │  session client (RLS)               │
│  ├─ atls.lock digest check               │  device token │        │  secret client (after own authz)   │
│  └─ Ed25519-signed receipt → ledger.jsonl │ ◀─────────── │        ▼                                     │
│ private key never leaves this machine     │ team pull    │ Supabase: Postgres (RLS, functions, audit),  │
└───────────────────────────────────────────┘              │ Auth (sessions), Storage (private exports)   │
                                                            └──────────────────────────────────────────────┘
```

## Components

| Part | Location | Notes |
| --- | --- | --- |
| CLI | `atls-cli/src/atls/` | Python ≥ 3.10, no required dependencies. `precheck.py` (Guard rules), `scanner.py` (tool definitions), `discover.py` (config scan), `lock.py` (atls.lock), `receipts.py` + `ed25519.py` + `canonical.py` (signed hash chain), `hook.py` (Claude Code adapter), `gateway.py` (stdio MCP proxy), `team.py` (sync client), `fileio.py` (atomic writes, OS file locks) |
| Rule data | `atls-cli/src/atls/data/*.json` | One source for both engines |
| Shared engine (JS) | `src/core/engine/atls-engine.mjs` | Line-for-line port of the Python engine; both are tested against the same fixtures (`atls-cli/tests/fixtures`). Used by the web app (simulator, scanning lock proposals, digest checks) and the live demo |
| Web core | `src/core/` | Pure TypeScript: receipt verification (Node `crypto` Ed25519), ingest planning, policy validation and simulator, evidence export builder, diff, role matrix |
| Server | `src/server/` | `server-only` modules: session and org access, device auth, data access, rate limits, HTTP helpers (problem+json, CSRF, body limits), log redaction |
| Routes | `src/app/api/v1/**` | Thin handlers: authenticate → authorize → validate → call core / database function |
| UI | `src/app/(site)` public, `src/app/(app)` dashboard, `src/components` | Server Components for reads; small client components for forms and actions |
| Database | `supabase/migrations/` | Tables, constraints, RLS, SECURITY DEFINER functions with role checks, append-only triggers, audit hash chain |

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| A1 | **Vercel + Supabase** instead of the earlier FastAPI + Fly.io + Neon plan | Requested hosting; Supabase gives Postgres RLS, Auth and Storage in one place. The security and product logic of the spec is kept. |
| A2 | **No language model in any decision.** Verdicts, scan results, lock checks and signature checks are deterministic code | Explainable, testable, same input → same bytes |
| A3 | **Fail safe.** Hook errors become `ask` (or `deny` via `fail_mode`); `fail_mode: open` is rejected by both engines; an unreadable lock makes every tool need approval; a failing rate limiter refuses requests | Never silently allow |
| A4 | **Receipts store hashes by default** (`receipts.include_args=false`); `atls sync` refuses receipts that contain arguments unless `--allow-args` | Privacy by default (spec D-17). The server must receive the exact signed bytes to verify signatures, so redaction cannot happen at upload time |
| A5 | **Server-side verification on ingest and on demand** with the device's enrolled public key; private keys never leave devices | Evidence the server cannot forge on behalf of a device |
| A6 | **Two Supabase clients.** Session client (publishable key + cookies) for everything a person does, so RLS applies; secret client only after Atls authenticated the caller itself (device token, enrollment code, exports storage, rate limits) | Least privilege; RLS is the default path |
| A7 | **All writes through SECURITY DEFINER functions** that check `auth.uid()` membership and write the audit entry in the same transaction; clients have SELECT only | Role rules live in one place, enforced by the database |
| A8 | **Device enrollment with one-time codes** (1 hour, single use) instead of an OAuth device-code flow | Simpler, no polling endpoint, works for CI runners; tokens are 256-bit and stored hashed |
| A9 | **Postgres-backed fixed-window rate limits** (`rate_limit_hit`) | Shared across serverless instances; in-memory counters are not |
| A10 | **CSP with a per-request nonce** in `src/proxy.ts`; pages are rendered dynamically | Blocks injected scripts; Next.js applies the nonce to its own scripts |
| A11 | **Theme in a cookie**, read by the root layout | No flash of the wrong theme on reload |
| A12 | **Exports built synchronously, capped at 20,000 receipts**, stored in a private bucket, downloaded through 60-second signed URLs | No background worker needed for the MVP; larger exports need a job queue (Phase 2) |
| A13 | **Policy simulator is mandatory before publishing**; a policy that blocks most of the everyday-action corpus is refused unless acknowledged | Spec D-16: prevent outage-by-policy |
| A14 | **Atls Advisories in OSV format, added by pull request**, `ATLS-YYYY-NNNN` IDs with CVE aliases | Spec D-12; the old name was replaced because "CVE" is a MITRE mark |
| A15 | Route paths use `/receipts/batch`, `/locks/{id}/approve` instead of `:batch`, `:approve` | Colons are invalid in Windows file names / Next.js route folders |
| A16 | Supabase **publishable/secret API keys** (`sb_publishable_`, `sb_secret_`) per current Supabase guidance; legacy `anon`/`service_role` keys work in the same variables | The secret key resolves to `service_role` and bypasses RLS, so it stays server-only and is checked not to be a publishable key |

## Receipt format `atls.receipt/1`

`v, id, seq, prev, issued_at, agent, session, action{server, tool, kind, args_sha256, args?}, decision{verdict, rules, policy_sha256, approved_by?}, outcome{status, result_sha256}, tool_sha256, kid, sig`

- `sig` = Ed25519 over the canonical JSON of all other fields (keys sorted by UTF-16 code units, no whitespace, numbers as JavaScript prints them).
- `prev` = `sha256:` + SHA-256 of the canonical JSON of the whole previous receipt.
- `kid` = `atl_` + first 16 hex characters of SHA-256(public key).
- Renaming the format from its earlier working name changed the `v` value, the key-id prefix and the rule-ID prefix (`ATL-`); all test vectors were regenerated (`atls-cli/tests/make_fixtures.py`, `make_receipt_vectors.py`).

## Defence in depth (web platform)

Each request crosses independent layers; any one of them failing is not enough for an attacker.

1. **Edge** (Vercel): network-level DDoS absorption, WAF rules, bot protection, Attack Challenge Mode (`deploy/vercel/README.md`).
2. **Shield** (`src/lib/shield.ts`, in `src/proxy.ts` and every API route): per-IP flood windows, scanner-path 404s, method and URL-length checks. Pure and synchronous, so a flood is refused before any database work.
3. **Identity**: Supabase Auth sessions in HttpOnly cookies; optional Turnstile CAPTCHA on every form that signs in or sends email; per-IP, per-account and per-recipient limits in Postgres; two-factor authentication (TOTP).
4. **Authorization**: server checks in every route, then row-level security in Postgres. With a verified second factor, RLS requires an aal2 session for any organization data (`mfa_ok()`), so a stolen password or an aal1 token reaches nothing.
5. **Evidence**: append-only receipts, policies and audit log; hash chains; signatures checked on upload and on demand.
6. **Resource limits**: body sizes, batch and page limits, statement timeouts for browser-reachable roles, self-pruning rate-limit table.

## Policy precedence (CLI)

`--policy FILE` → `./atls.policy.json` → `~/.atls/team/policy.json` (from `atls team pull`) → `~/.atls/policy.json` → built-in defaults (always merged underneath).

## What is not built (by design, for this MVP)

Verified-tool certification, insurance/guarantees, payment clearing, a public tool registry, Merkle anchoring to a transparency log, advisory submission portal, OAuth device flow, background export jobs, email delivery of invitations. See `docs/requirements-traceability.md` for the phase of each.
