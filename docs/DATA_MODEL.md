# Data model

All tables live in the `public` schema of the Supabase project, are created by `supabase/migrations/20261011000100_atls_schema.sql`, and have **row-level security enabled**. Clients (`authenticated`) only have `SELECT`; every change goes through a function listed below. The `service_role` (secret key) is used only by server code after its own authentication checks.

## Tables

| Table | Purpose | Key constraints | Who can read (RLS) |
| --- | --- | --- | --- |
| `profiles` | One row per auth user (created by trigger on `auth.users`) | `id` → `auth.users` | yourself and people in your organizations; you may update only `display_name` |
| `orgs` | Organizations | `slug` unique, 3–40 chars `[a-z0-9-]` | members |
| `memberships` | `(org_id, user_id, role)` with role `owner/admin/member/auditor` | PK `(org_id, user_id)`; `user_id` → `profiles` | members of that org |
| `invitations` | Pending invites; only `sha256(token)` stored | `token_hash` unique hex64; role ≠ owner; expires 7 days | owners, admins |
| `devices` | Enrolled devices: name, platform, `kid`, Ed25519 public key, status | `unique(org_id, kid)`; `kid ~ ^atl_[0-9a-f]{16}$`; key is 43 base64url chars; `status='revoked' ⇔ revoked_at` | members |
| `device_enrollments` | One-time codes (`sha256(code)`), 1 hour | `code_hash` unique | owners, admins |
| `device_tokens` | Device bearer tokens (`sha256` only), 365 days | `token_hash` unique | **nobody** (server only) |
| `chains` | One hash chain per device key: `last_seq`, `last_hash`, `receipt_count` | `unique(org_id, chain_id)`; `last_seq=-1 ⇔ last_hash null`; `receipt_count = last_seq+1` | members |
| `receipts` | Signed receipts: indexed metadata + the exact signed `body` | `unique(chain_pk, seq)`, `unique(org_id, hash)`, `seq=0 ⇔ prev null`, body ≤ 32 KB, **no UPDATE** (trigger) | members |
| `policies` | Immutable policy versions with `sha256(body::text)` | `unique(org_id, version)`, body ≤ 64 KB, **no UPDATE** | members |
| `locks` | Proposed/approved/rejected tool definitions | `unique(org_id, server_id, tool_name, digest)`; `status='pending' ⇔ decided_at null` | members |
| `audit_log` | Append-only, hash-chained per org (`prev_hash`, `hash`) | **no UPDATE/DELETE** (trigger); `action ~ ^[a-z_]+\.[a-z_]+$` | owners, admins, auditors |
| `exports` | Evidence export jobs, manifest and its SHA-256, storage path | `to_ts > from_ts` | owners, admins, auditors |
| `advisories` | Verfy Advisories (OSV) | `id ~ ^ATLS-\d{4}-\d{4,}$` | anyone (incl. anonymous), `status='published'` only |
| `rate_limits` | Fixed-window counters | PK `(bucket, window_start)` | **nobody** (server only) |

Indexes cover the dashboard's queries: receipts by `(org_id, issued_at)`, `(org_id, verdict, issued_at)`, `(org_id, tool)`, `(org_id, device_id, issued_at)`; locks by `(org_id, status, created_at)`; audit by `(org_id, id)`.

Storage: bucket `exports` (private, no client policies). Objects at `<org_id>/<export_id>/receipts.jsonl` and `manifest.json`.

## Functions

Signed-in users (`authenticated`), each checks the caller's role and writes an audit entry:

| Function | Allowed roles |
| --- | --- |
| `create_org(name, slug)` | any signed-in user (≤ 10 owned orgs); creates owner membership and policy v1 = `{}` |
| `create_invitation(org, email, role)` → token | owner, admin; not `owner` role; ≤ 50 open |
| `revoke_invitation(id)` | owner, admin |
| `accept_invitation(token)` → org | the invited email only; once; before expiry |
| `set_member_role(org, user, role)` | owner, admin; only owners touch owners; last owner protected |
| `remove_member(org, user)` | owner, admin (not owners unless owner), or yourself; last owner protected |
| `create_device_enrollment(org)` → code | owner, admin; ≤ 20 open |
| `revoke_device(id)` | owner, admin; revokes all its tokens |
| `publish_policy(org, body, note)` → version | owner, admin; serialized per org |
| `decide_lock(id, approve, note)` | owner, admin; pending only |
| `start_export(org, from, to, filters)` → id | owner, admin, auditor; range ≤ 1 year |
| `org_stats(org)` | members |
| `is_member`, `has_role`, `org_role_of` | helpers used by RLS policies |

Server only (`service_role`): `device_for_token`, `enroll_device`, `ingest_receipts` (re-checks the chain head under `FOR UPDATE`), `propose_lock`, `complete_export`, `rate_limit_hit`, `prune_rate_limits`, `write_audit`.

## Audit actions

`org.create`, `member.invite`, `member.invite_revoke`, `member.join`, `member.role`, `member.remove`, `member.leave`, `device.enrollment_create`, `device.enroll`, `device.revoke`, `policy.publish`, `lock.propose`, `lock.approve`, `lock.reject`, `export.request`, `export.ready`, `export.failed`. Details never contain tokens, codes, secrets or tool arguments.

## Local files (CLI)

`~/.verfy/` (or `$VERFY_HOME`): `key.json` (Ed25519 private key, mode 0600), `policy.json`, `team/policy.json`, `verfy.lock`, `ledger.jsonl`, `seen/<server>.json`, `scans/`, `team.json` (device token, 0600), `sync-state.json`.
