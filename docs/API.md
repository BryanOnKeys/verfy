# Verfy API (v1)

Base URL: your deployment, e.g. `https://verfy.example.com`. All bodies are JSON (`Content-Type: application/json`). Every response has `Cache-Control: no-store` and an `x-request-id` header.

## Authentication

| Caller | How | Used by |
| --- | --- | --- |
| Device | `Authorization: Bearer atd_<43 base64url chars>` — issued once by `POST /api/v1/devices/enroll`; stored server-side only as SHA-256; valid 365 days; dies when the device is revoked | `verfy` CLI |
| Person | Supabase session cookie (sign in on the web). State-changing requests must come from the app's own origin (`Origin` header is checked: CSRF protection) | dashboard, scripts in a signed-in browser |
| Public | none, rate limited per IP | advisories feed, enrollment |

Session endpoints that read organization data take `?org=<organization uuid>`; endpoints that change data take `org_id` in the body. The server checks membership and role for every call, and Postgres RLS checks again.

## Errors

RFC 9457 problem details, `Content-Type: application/problem+json`:

```json
{ "type": "urn:verfy:problem:chain_gap", "title": "The receipts were not accepted.", "status": 422,
  "code": "chain_gap", "detail": "expected seq 12, got 14", "request_id": "…", "index": 0 }
```

| Status | `code` examples | Meaning |
| --- | --- | --- |
| 400 | `invalid_json`, `invalid_enrollment_code` | body is not JSON / code wrong, used or expired |
| 401 | `unauthenticated`, `mfa_required` | no or invalid session / device token; or two-factor authentication is on and this session has not entered its code yet |
| 403 | `forbidden`, `bad_origin` | role does not allow it / cross-site request |
| 404 | `not_found` | not found **or** not visible to you (no existence leaks) |
| 405 | `method_not_allowed` | the route does not accept this HTTP method |
| 409 | `chain_conflict`, `chain_moved`, `version_conflict`, `conflict` | concurrent change, fork/replay, already exists |
| 413 | `payload_too_large` | body over the endpoint's limit |
| 414 | `uri_too_long` | the URL is longer than 4 KB |
| 415 | `unsupported_media_type` | not `application/json` |
| 422 | `invalid_request`, `invalid_receipt`, `bad_signature`, `chain_gap`, `chain_broken`, `clock_skew`, `wrong_key`, `invalid_policy`, `policy_lockout`, `digest_mismatch`, `export_too_large` | validation failed |
| 429 | `rate_limited`, `limit_reached` | slow down: wait `retry_after_seconds` (also sent as a `Retry-After` header) |
| 500 | `internal`, `export_failed` | generic; no stack traces, SQL or configuration are ever returned |
| 503 | `not_configured`, `rate_limit_unavailable`, `unavailable` | deployment misconfigured or a dependency is down (requests are refused, not let through) |

## Rate limits

Every request first passes the shield (`src/lib/shield.ts`): at most 600 API requests per minute per IP on each server instance, failed device-token authentications at most 20 per 10 minutes per IP. Then the limits below apply, shared across all instances (Postgres):

| Limit | Key | Max |
| --- | --- | --- |
| enroll | IP hash | 20 / hour |
| ingest | device | 120 / minute |
| proposeLock | device | 200 / hour |
| deviceRead | device | 120 / minute |
| publicRead | IP hash | 60 / minute |
| auth (sign-in, sign-up, magic link, reset, accept invite, 2FA codes) | IP hash / user | 10 / 15 minutes |
| authAccount (sign-in) | account (hashed email) | 20 / hour |
| emailSend (magic link, sign-up, reset) | recipient (hashed email) | 5 / hour |
| deviceAuthFail | IP hash | 30 / 10 minutes |
| userWrite | user | 60 / minute |
| export | user | 10 / hour |
| simulate, chain verify | user | 30 / minute |

---

## Device endpoints

### `POST /api/v1/devices/enroll` — public, rate limited

Redeem a one-time enrollment code. Only the **public** key is sent.

```json
{ "code": "atle_<64 hex>", "public_key": "<43 base64url>", "kid": "atl_<16 hex>", "name": "dev-laptop", "platform": "Darwin arm64" }
```

`kid` must equal `"atl_" + sha256(public_key bytes)[:16]`. Body ≤ 4 KB, unknown fields rejected.
`201` → `{ "device_id", "org_id", "org_name", "token": "atd_…" }` (the token is shown only here).
Errors: `400 invalid_enrollment_code`, `409 device_key_exists`, `422`, `429`.

### `POST /api/v1/receipts/batch` — device token

Upload 1–500 signed `verfy.receipt/1` receipts, in ascending, contiguous `seq` order. Body ≤ 500 × 16 KB.

```json
{ "receipts": [ { "v": "verfy.receipt/1", "id": "rcpt_…", "seq": 0, "prev": null, "issued_at": "2026-10-11T09:00:00.000Z",
                  "agent": "claude-code", "session": "ses_…",
                  "action": { "server": "claude-code", "tool": "Bash", "kind": "shell", "args_sha256": "sha256:…" },
                  "decision": { "verdict": "deny", "rules": ["VFY-SH-001"], "policy_sha256": "sha256:…" },
                  "outcome": { "status": "blocked", "result_sha256": null },
                  "tool_sha256": null, "kid": "atl_…", "sig": "<86 base64url>" } ] }
```

The server checks, in order: schema (strict, v1 fields only), size, contiguous seq, key id = device key, idempotency (same hash already stored → duplicate), fork/replay (different content at a stored seq → `409 chain_conflict`), gap (`422 chain_gap`), `prev` link (`422 chain_broken`), `issued_at` not > 5 min in the future (`422 clock_skew`), Ed25519 signature (`422 bad_signature`). The insert runs in one transaction that re-checks the chain head under a row lock (`409 chain_moved` on a concurrent upload: retry).

`200` → `{ "accepted": 3, "duplicates": 0, "head_seq": 41, "head_hash": "sha256:…" }`

### `POST /api/v1/locks/propose` — device token

```json
{ "server_id": "github", "tool_name": "create_issue", "digest": "sha256:…",
  "definition": { "name": "create_issue", "description": "…", "inputSchema": { } } }
```

`digest` must equal the canonical digest of `definition` (`422 digest_mismatch`). `201` → `{ "id", "status": "pending" }` (idempotent per org/server/tool/digest).

### `GET /api/v1/policies/current` — device token, or member session with `?org=`

`200` → `{ "version": 2, "sha256": "<hex>", "body": { … }, "note": "…", "created_at": "…" }`

### `GET /api/v1/locks?status=pending|approved|rejected` — device token, or member session with `?org=`

`200` → `{ "locks": [ { "id", "server_id", "tool_name", "digest", "definition", "status", "created_at", "decided_at", "decision_note", "proposed_by_device" } ] }`

---

## Session endpoints

| Method | Path | Role | Body / query | Success |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/orgs` | signed in | `{ name, slug }` | `201 { id }` — caller becomes owner; policy v1 = Verfy defaults |
| POST | `/api/v1/orgs/{orgId}/invitations` | owner, admin | `{ email, role: admin\|member\|auditor }` | `201 { link, email, role, expires_in_days: 7 }` — Verfy does not send email |
| DELETE | `/api/v1/orgs/{orgId}/invitations/{id}` | owner, admin | — | `204` — the link stops working |
| POST | `/api/v1/invitations/accept` | signed in (invited email) | `{ token }` | `200 { org_id }` |
| PATCH | `/api/v1/orgs/{orgId}/members/{userId}` | owner, admin (only owners change owners; last owner stays) | `{ role }` | `200` |
| DELETE | `/api/v1/orgs/{orgId}/members/{userId}` | owner, admin, or yourself | — | `204` |
| POST | `/api/v1/devices/enrollments` | owner, admin | `{ org_id }` | `201 { code, expires_in_seconds: 3600 }` — shown once |
| POST | `/api/v1/devices/{id}/revoke` | owner, admin | `{ org_id }` | `200 { id, status: "revoked" }` — tokens stop at once; receipts stay |
| GET | `/api/v1/receipts` | any member | `?org&verdict&tool&server&device&from&to&page&page_size≤200` | `200 { rows, total, page, page_size }` |
| GET | `/api/v1/receipts/{id}` | any member | `?org` | `200 { id, seq, hash, signature: valid\|invalid\|unknown_key, chain_id, body }` |
| GET | `/api/v1/chains/{chainId}/verify` | any member | `?org` | `200 { ok, count, head, stored_head, errors[≤100], truncated, verified_at }` |
| PUT | `/api/v1/policies/current` | owner, admin | `{ org_id, body, note?, expected_version, acknowledge_lockout? }` | `200 { version, simulation }`; `409 version_conflict`; `422 invalid_policy`; `422 policy_lockout` (with `simulation`) |
| POST | `/api/v1/policies/simulate` | any member | `{ org_id, body, actions?[≤50] }` | `200 { total, counts, changes, safe_total, safe_blocked, lockout, warnings }` |
| POST | `/api/v1/locks/{id}/approve` | owner, admin | `{ org_id, note? }` | `200 { id, status }` |
| POST | `/api/v1/locks/{id}/reject` | owner, admin | `{ org_id, note? }` | `200 { id, status }` |
| POST | `/api/v1/exports` | owner, admin, auditor | `{ org_id, from, to, verdict? }` (≤ 1 year, ≤ 20,000 receipts) | `201 { id, status: "ready", receipt_count, manifest_sha256 }` |
| GET | `/api/v1/exports` | owner, admin, auditor | `?org` | `200 { exports }` |
| GET | `/api/v1/exports/{id}` | owner, admin, auditor | `?org` | `200 { …, downloads: { receipts, manifest }, downloads_expire_in_seconds: 60 }` |
| GET | `/api/v1/audit` | owner, admin, auditor | `?org&before&limit≤200` | `200 { entries }` |

### Policy body

A JSON object merged over the CLI defaults (`verfy-cli/src/verfy/data/default_policy.json`). Allowed keys: `agent, on_ask (deny|allow|elicit), fail_mode (ask|deny), hide_unsafe_tools, disabled_rules (VFY-XX-NNN), tools {deny, ask, trust}, files {sensitive, deny_write, allow_write, outside_workspace}, network {allow, deny, unknown}, payments {…}, rules [{id, pattern, flags?, verdict, message?, tool?, arg?}], receipts {include_args}, lock {on_new}`. `home` and `workspace` are local and rejected. Regexes must compile and may not contain nested quantifiers. ≤ 64 KB.

## Public endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/advisories?q&severity&ecosystem` | `{ format: "verfy.advisories/1", count, advisories }`; only published entries; `review_status: "unreviewed"` = from public sources, not reproduced by Verfy |
| GET | `/api/health` | `{ ok, service, version, configured }` — never returns configuration values |

## Path note

The design spec wrote endpoints such as `/v1/receipts:batch` and `/v1/locks/{id}:approve`. Colons are not valid in file names on Windows and are awkward in Next.js route folders, so Verfy uses `/api/v1/receipts/batch` and `/api/v1/locks/{id}/approve`. The behaviour is the same.
