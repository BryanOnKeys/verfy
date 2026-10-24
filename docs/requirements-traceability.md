# Requirements traceability

Every requirement of the Verfy build brief and the source spec (final decisions in `00_README_va_YAKUNIY_HUKM.md`, `14-redteam-decisions-done.md`, `06_ILOVA_Code-Ready_Spec`) mapped to code, tests and docs. Status: **Done** (implemented and tested), **Partial** (implemented with a stated limit), **Phase 2 / Future** (not built; not claimed anywhere in the product).

Test locations: `CLI` = `verfy-cli/tests/`, `TS` = `src/**/*.test.ts`, `DB` = `supabase/tests/`, `E2E` = the browser + CLI journey run against the local PostgREST stack (see Verification at the end).

## Brand

| Requirement | Code | Test | Status |
| --- | --- | --- | --- |
| One brand, Verfy, in code, UI, package, CLI, config, receipt format, rule IDs, docs | everywhere; `verfy` CLI, `verfy.lock`, `.verfy/`, `verfy.receipt/1`, `VFY-*` rules; advisory IDs stay `ATLS-*` because they are stored in the production database | `scripts/check-brand.mjs` (CI) | Done |
| Rename does not break canonical JSON, hashes or signatures | fixtures regenerated: `make_fixtures.py`, `make_receipt_vectors.py` | CLI cross-engine tests, `TS receipts.test.ts` | Done |
| Third-party licenses untouched | `LICENSE` (MIT, original copyright holder kept) | — | Done |

## Verfy Guard

| Requirement | Code | Test | Status |
| --- | --- | --- | --- |
| Deterministic pre-check: allow / ask / deny with rule ID and reason | `precheck.py`, `verfy-engine.mjs` | 104 fixture cases × 2 engines | Done |
| Shell, file path, URL/network, SQL, secret exposure, payments | same | fixtures | Done |
| Every verdict linked to a receipt | `hook.py`, `gateway.py` | `HookTests.test_cli_hook_writes_receipt`, gateway tests | Done |
| Fail-safe: errors never allow; `fail_mode` ask/deny; `open` rejected | `hook.run_hook`, `policy.load_policy`, engine `loadPolicy` | `test_errors_never_allow`, `test_fail_mode_must_not_be_open` | Done |
| Claude Code PreToolUse adapter + installer | `hook.py`, `verfy hook install` | hook tests, `test_install_is_idempotent` | Done |
| No network calls inside the hook | `hook.py` (team sync is a separate command) | code review; `team.py` not imported by hook | Done |
| No LLM in decisions | whole codebase | — (no model calls exist) | Done |

## Verfy Scan

| Requirement | Code | Test | Status |
| --- | --- | --- | --- |
| Discover Claude Code / Cursor / Claude Desktop configs | `discover.py` | `test_discover_reads_project_servers` | Done |
| Tool poisoning, hidden instructions, secret reads, shadowing, invisible Unicode, drift | `scanner.py` | scan fixtures, gateway tests | Done |
| Config checks: unpinned packages (also behind `cmd /c` and `sh -c`; npx of a declared dependency is not reported), curl|sh, plain http, remote servers without credentials (info), secrets, privileged containers |\|sh, plain http, missing auth, secrets, privileged containers | `discover.py` (`VFY-CFG-001..007`) | `ConfigScanTests` | Done |
| Finding = rule ID, severity, evidence location, remediation | `scanner.py`, `discover.py` | tests | Done |
| Static by default; servers started only with explicit `--live` | `cli.cmd_scan` | `test_cli_static_scan_exit_code` | Done |
| Unknown ≠ safe; no claim of runtime audit | UI copy, `SECURITY_LIMITATIONS.md` | — | Done |

## Verfy Lock

| Requirement | Code | Test | Status |
| --- | --- | --- | --- |
| SHA-256 digest of canonical {name, description, inputSchema} | `scanner.tool_pin`, `lock.py`, engine `toolPin` | `test_tool_pin_is_definition_digest`, seed test | Done |
| `verfy.lock` file, deterministic bytes | `lock.py` | `test_deterministic_bytes` | Done |
| Drift → deny; new tool on locked server → ask; unreadable lock → ask | `gateway.py`, `precheck.py` (`VFY-TOOL-004/006/007`) | `test_rug_pull`, `test_new_tool_on_locked_server_needs_approval`, `test_unreadable_lock_fails_safe` | Done |
| Review with readable diff, explicit approval | `verfy lock diff/approve`, `src/core/diff.ts`, Locks page | `test_cli_lock_flow`, `diff.test.ts`, E2E | Done |
| Tampered lock file rejected | `lock.validate_lock` | `test_tampered_digest_is_rejected` | Done |
| Team lock proposals and admin approval, pulled by devices | `/api/v1/locks/propose`, `decide_lock`, `verfy team propose/pull` | DB tests, E2E | Done |

## Verfy Receipts

| Requirement | Code | Test | Status |
| --- | --- | --- | --- |
| Ed25519 signature, SHA-256 chain, seq, prev, timestamp, tool digest, policy hash, verdict, rule IDs | `receipts.py`, `src/core/receipts.ts` | Python, JS and TS tamper/delete/reorder tests | Done |
| Independent verifier | `verfy verify` (Python), `verifyChain` (TS), JS engine | cross-implementation vectors | Done |
| Concurrent sessions never fork the chain | `Ledger.append` under OS file lock | `test_parallel_writers_keep_one_chain` (3 processes × 40) | Done |
| Private key stays on device | `team.enroll` sends public key only | `test_enroll_and_sync` | Done |
| Arguments hashed by default; redaction when stored | `build_receipt(include_args=False)`, `redact_value` | `test_hash_only_by_default`, redaction tests | Done |
| Secrets in MCP tool results and resources redacted before the agent reads them (every match, overlaps merged) | `Gateway._redact`, `redact_output`, `secret_spans` | `test_secrets_in_output_are_redacted`, `test_redaction_covers_every_secret` | Done (gateway only; Claude Code built-in tool output cannot be rewritten by a hook) |
| Approval queue: an ask through the gateway waits for an owner/admin in the dashboard; expires; only a hash of the arguments leaves the device | `approvals` table and functions (`20261024000100_approvals.sql`), `/api/v1/approvals`, Dashboard → Approvals, `Gateway._ask_team` | `approval queue` (rls.test.ts), `test_team_approval_queue` | Done (gateway only) |
| Ready-made policies: strict, read-only, ci; the agent cannot switch policy | `data/templates.json`, `verfy policy`, `verfy init --template`, VFY-SELF-003 | `test_policy_templates`, fixtures | Done |
| Honest statement of what receipts prove | `/security`, receipt page, export manifest, README | — | Done |
| External timestamping / Merkle anchoring (Rekor) | — | — | Phase 2 |

## Verfy Team (web)

| Requirement | Code | Test | Status |
| --- | --- | --- | --- |
| Orgs, memberships, roles owner/admin/member/auditor | migration, `src/core/permissions.ts` | `rls.test.ts` roles, `policy.test.ts` role matrix | Done |
| Invitations (copyable link, no email provider) | `create_invitation`, `accept_invitation`, Team page | DB tests, E2E | Done |
| Device enrollment, list, last seen, revoke | `/devices/enrollments`, `/devices/enroll`, `revoke_device`, Devices page | DB tests, E2E (revoked device gets 401) | Done |
| Receipt ingest: schema, signature, sequence, prev hash, idempotency, tenant ownership, ≤ 500 | `/receipts/batch`, `src/core/ingest.ts`, `ingest_receipts` | `receipts.test.ts`, DB ingest tests, E2E forged upload | Done |
| Receipt search/filter, detail, chain and signature status, JSON download | Receipts pages, `/api/v1/receipts`, `/chains/{id}/verify` | E2E | Done |
| Policies: edit, validate, version history, simulator, role-gated publish | Policies page, `/policies/*`, `publish_policy`, `src/core/policy.ts` | `policy.test.ts`, E2E | Done |
| Audit log of every admin action, tamper-evident | `audit_log` + trigger chain, Audit page | DB audit chain test, E2E | Done |
| Evidence export JSONL + manifest hash + integrity | `/api/v1/exports`, `src/core/evidence.ts`, private bucket, 60 s signed URLs | `evidence.test.ts`, E2E (sha256 + offline `verfy verify`) | Done (≤ 20,000 receipts per export) |
| Large exports via background jobs | — | — | Phase 2 |
| Public Verfy Advisories feed and pages, OSV, sourced | `advisories/`, migration, `/advisories`, `/api/v1/advisories` | `seed.test.ts`, `scripts/advisories.mjs` in CI | Done |
| Advisory submission/moderation portal | — | — | Phase 2 |
| KPIs only from real queries; DEMO labelled | `org_stats`, Overview page, DEMO ribbon | E2E | Done |

## Architecture, security and deployment

| Requirement | Code | Test | Status |
| --- | --- | --- | --- |
| Next.js App Router + TypeScript strict, Node runtime for crypto routes | `tsconfig.json`, `export const runtime = "nodejs"` | `npm run typecheck`, build | Done |
| Supabase SSR cookie sessions (getClaims), HttpOnly, no localStorage tokens | `src/lib/supabase/*`, `src/proxy.ts` | E2E sign-in/out | Done |
| Email + password, magic link, password reset; GitHub OAuth when configured | `src/app/auth/actions.ts`, callback/confirm routes | E2E (password), unit (`safeNext`) | Done (GitHub needs your OAuth app) |
| RLS on every table; cross-tenant read/write impossible | migration | `rls.test.ts` | Done |
| Session client vs secret client, server-side authorization before secret use | `src/lib/supabase/admin.ts`, routes | code review, DB tests | Done |
| Schema validation, body limits, safe machine-readable errors | `src/server/http.ts`, zod in routes | `http.test.ts` | Done |
| CSRF / Origin, CSP nonce, HSTS, nosniff, referrer, permissions, frame-ancestors | `http.ts`, `src/lib/csp.ts`, `next.config.ts` | `safe-redirect.test.ts` (CSP), header check | Done |
| Shared rate limits (IP hash + user/device), fail closed | `ratelimit.ts`, `rate_limit_hit` | DB rate-limit test | Done |
| SSRF | Verfy Team never fetches user-supplied URLs (no fetch-by-URL feature) | — | N/A by design |
| Structured logs with redaction and request IDs | `src/server/log.ts`, `route()` | `http.test.ts` | Done |
| Secrets never committed / never in bundle | `.gitignore`, `check-secrets.mjs`, lint rule | CI | Done |
| CI: lint, types, tests, CLI tests, build, audit, secret scan, CodeQL | `.github/workflows/*` | — | Done |
| Three deploy folders with checklists and rollback | `deploy/github`, `deploy/supabase`, `deploy/vercel` | — | Done |
| Dark/light theme without flash, responsive 360–1920, reduced motion, keyboard and focus | `globals.css`, `theme-toggle.tsx`, layout | browser checks (8 widths × 2 themes), E2E | Done |
| Threat model and limitations | `docs/THREAT_MODEL.md`, `docs/SECURITY_LIMITATIONS.md` | — | Done |

## Explicitly out of scope (not built, not claimed)

| Item | Phase |
| --- | --- |
| Verfy Verified (tool certification, badges) | Future |
| Insurance, assurance, guarantees | Future |
| Payment clearing / agent commerce | Future |
| Universal tool registry | Future |
| Hosted paid plan, billing | Future (no billing code exists) |
| OAuth device-code flow for the CLI (one-time codes are used) | Phase 2 |
| Merkle checkpoints, RFC 3161 / Rekor anchoring | Phase 2 |
| Approve-from-Slack, incident workflow, LLM explanations | Phase 2 |
| PyPI release (`pip install verfy`, Trusted Publishing from `.github/workflows/publish.yml`) | Done in 0.2.0 |
| Sigstore attestations on PyPI (from the next release, now that the repository is public) | Done in publish.yml |
| SARIF output | Phase 2 |

## Verification performed for this release

- Python CLI: 53 tests (unit, gateway over pipes, hook, lock, team client, 3-process ledger, cross-engine signatures).
- JS engine: 125 fixture checks.
- TypeScript + database: Vitest suites for core, server helpers, and the real migrations on PGlite (tenant isolation, roles, ingest, audit chain, seed, advisories).
- Production build of all routes; browser checks of public pages at 360–1920 px in dark and light (no overflow, no console or CSP errors).
- End-to-end journey with a real browser, the real CLI and a local stack (PGlite + PostgREST 16 + a minimal auth/storage gateway): sign-in, receipts, signature and chain verification, policy simulate/publish, lock approve, device enroll, sync (idempotent), forged-receipt rejection, team pull enforcing the published rule, invitation, export with offline verification, audit chain, device revoke, theme persistence, mobile navigation, sign-out.
- Hardening (2026-10-12): shield unit tests (limits, eviction, probes, IP handling, CSP with CAPTCHA); database tests proving two-factor authentication is enforced by RLS (aal1 sees nothing and changes nothing once a factor is verified); end-to-end 2FA journey against the local stack (enroll with a real TOTP code, wrong codes refused, password-only sign-in stops at the code prompt, dashboard and API closed until the code, turn off); flood test (41st Server Action POST in a minute from one IP → 429 with Retry-After, spoofed `x-forwarded-for` prefix does not bypass it); scanner paths and odd methods refused.
- Not performed: tests against a hosted Supabase/Vercel deployment (needs your accounts), Turnstile with real keys, GitHub OAuth, real email delivery, independent penetration test, load testing at DDoS scale.
