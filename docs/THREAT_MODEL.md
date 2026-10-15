# Threat model

Scope: the Verfy CLI on developer machines and CI runners, and a Verfy Team deployment (Next.js on Vercel, Supabase). Reviewed against the implementation on 2026-10-12. Update it with every feature that changes a trust boundary.

## Assets

1. Integrity of verdicts (an attacker must not turn deny into allow).
2. Integrity and authenticity of receipts and the audit log (evidence).
3. Confidentiality of each organization's data (receipts metadata, policies, devices, members).
4. Device private keys and device tokens.
5. Availability of the guard on developer machines (it must not lock developers out or depend on the network).

## Trust boundaries

| Boundary | Trusted side | Untrusted side |
| --- | --- | --- |
| Agent ↔ Verfy hook/gateway | Verfy process, its policy and lock files | the agent, prompts, tool descriptions, MCP server output |
| CLI ↔ Verfy Team | the device key; the server's TLS certificate | the network |
| Browser ↔ Next.js | server code and its environment | browser input, cookies, other sites |
| Next.js ↔ Supabase | the secret key (server only), RLS policies | everything a client sends |
| Organization ↔ organization | — | every other tenant |

## Threats and controls

| ID | Threat | Control (code) | Test | Residual risk |
| --- | --- | --- | --- | --- |
| T1 | Prompt-injected agent runs a destructive or exfiltrating command | Guard rules (`precheck.py`, `VFY-SH/FS/NET/SEC/SQL/PAY`), hook denies before execution | 104 fixture cases in both engines, hook tests | Shell parsing cannot understand every command; Verfy is not a sandbox |
| T2 | Tool poisoning / hidden instructions / invisible Unicode in MCP tool descriptions | Scanner (`VFY-SCAN-*`); gateway hides tools with critical findings | scan fixtures, gateway tests | Novel phrasing can evade patterns |
| T3 | Rug pull: an approved tool changes later | `verfy.lock` digests; drift → hidden + `VFY-TOOL-004` deny; new tools on a locked server → ask; lock file tamper detection (digest recomputed from stored definition) | `test_rug_pull`, lock tests | Unlocked first use is trust-on-first-use |
| T4 | Verfy itself fails (bad policy, unreadable lock, disk full, crash) and the agent proceeds | Fail-safe to `ask`/`deny`; `fail_mode: open` rejected; never answers allow from the hook | `test_errors_never_allow`, unreadable-lock test | A user can uninstall the hook |
| T5 | Local ledger edited, truncated in the middle, reordered | Ed25519 signatures + hash chain; `verfy verify` | tamper/delete/reorder tests (Python, JS, TS) | Deleting the whole ledger and the key is only visible against the Team copy |
| T6 | Forged or replayed receipts uploaded to Team | Server verifies schema, signature with the enrolled key, contiguity, `prev` link, idempotency by hash, fork detection, clock skew; DB re-checks head under a row lock; `unique(chain, seq)`, `unique(org, hash)` | `receipts.test.ts`, RLS ingest tests, e2e forged upload | A compromised device can sign false receipts with its own key until revoked |
| T7 | Cross-tenant read/write by changing an ID | RLS on every table, `org_id` checked server-side, no client writes; 404 for invisible rows | `rls.test.ts` (two orgs, every table and function) | Bugs in future SQL; keep the tests |
| T8 | Privilege escalation inside an org (member → admin, admin → owner, removing last owner) | Role checks inside every SECURITY DEFINER function | role tests | — |
| T9 | Stolen device token | 256-bit tokens, SHA-256 stored, 365-day expiry, instant revoke, per-device rate limits | e2e revoke test | Tokens on a stolen unlocked laptop are usable until revoked |
| T10 | Stolen session cookie / CSRF | Supabase SSR cookies (HttpOnly, Secure, SameSite=Lax), Origin checks on every cookie-authenticated change, Server Actions' Origin check | `http.test.ts` CSRF test | XSS would bypass CSRF defences → T11 |
| T11 | XSS | React escaping, no `dangerouslySetInnerHTML`, CSP with per-request nonce and `strict-dynamic`, `object-src 'none'` | CSP tests, browser console checks | `style-src-attr 'unsafe-inline'` allows inline style attributes (no script) |
| T12 | Open redirect after sign-in | `safeNext` allowlist | `safe-redirect.test.ts` | — |
| T13 | Secret key leak (bundle, logs, errors) | `server-only` imports, no `NEXT_PUBLIC_` secrets (lint rule), bundle scan in CI, log redaction, generic 500s | `check-secrets.mjs`, `http.test.ts` | Human error in the Vercel dashboard |
| T14 | Brute force / credential stuffing / enrollment-code guessing | Per-IP limits (in-memory shield, then Postgres), **per-account** sign-in limits (20/hour whatever the IP), per-recipient limits on email-sending forms (5/hour), failed device-token limits per IP, optional Turnstile CAPTCHA, Supabase Auth limits; enrollment codes carry 244 random bits and expire in 1 hour | `shield.test.ts`, e2e flood test (41st POST in a minute → 429) | A very large botnet can still try a few passwords per account per hour; two-factor authentication (T21) makes a correct password insufficient |
| T15 | DoS via large bodies, expensive queries or request floods | Shield before any work (per-IP windows, URL ≤ 4 KB, method allowlist, scanner paths → 404); byte limits per route, batch ≤ 500, page size ≤ 200, export ≤ 20,000, verify ≤ 100,000; statement timeouts 3 s (anon) / 8 s (authenticated); self-pruning rate-limit table; regex nested-quantifier rejection | `shield.test.ts`, `http.test.ts`, policy tests | Shield windows are per server instance; volumetric DDoS is absorbed by Vercel's network and the WAF rules in `deploy/vercel/README.md`, not by app code |
| T16 | Lock-out by policy (a team publishes a policy that blocks everything) | Mandatory simulator; lockout refused unless acknowledged; audit entry | `policy.test.ts`, e2e | An admin can still acknowledge |
| T17 | Evidence tampering on the server (insider with the secret key) | Receipts, policies and audit log are append-only (triggers), audit log hash-chained per org; exports carry hashes and public keys for offline verification | RLS tests ("even the server cannot edit") | A database superuser can drop triggers; external anchoring is Phase 2 |
| T18 | Sensitive arguments leak to the cloud | Hash-only receipts by default; sync refuses receipts with arguments unless `--allow-args`; secrets redacted when arguments are stored | team tests, hook test | Tool names and server names are uploaded as metadata |
| T19 | Malicious MCP config (curl \| sh launchers, privileged containers, secrets in configs) | Static config scan (`VFY-CFG-*`), never executes servers unless `--live` | config scan tests | Static checks only see the config |
| T20 | Advisory poisoning | Advisories only via pull request with a public source; schema validated in CI; shown as "unreviewed" until reproduced | `scripts/advisories.mjs`, seed test | Reviewer error |
| T21 | Account takeover with a stolen or guessed password | Two-factor authentication (TOTP); with a verified factor, RLS (`mfa_ok()`) hides all organization data and `require_role` refuses every change until the session is aal2; the app routes aal1 sessions to the code prompt and API routes answer `401 mfa_required`; code attempts rate limited per user | `supabase/tests/mfa.test.ts`, e2e 2FA flow | Users who do not turn it on are protected by their password only; recommend it for owners and admins |
| T22 | Rate limits evaded by spoofing the client IP | IP taken from Vercel's `x-real-ip` (set by the edge); elsewhere the right-most `x-forwarded-for` entry (the trusted proxy's); malformed values ignored | `shield.test.ts`, e2e spoofed-header check | Self-hosting behind more than one proxy needs the hop count adjusted |
| T23 | Automated scanners and probes (`/.env`, `/.git`, `wp-login.php`…) | Cheap 404 in the shield before session handling or rendering; edge deny rule recommended | `shield.test.ts`, e2e | — |

## Out of scope

Compromise of Supabase, Vercel or GitHub themselves; a fully compromised developer machine (root); agents that bypass the hook/gateway; physical attacks.
