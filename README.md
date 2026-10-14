# Atls

**Security, policy and verifiable evidence for coding agents and the MCP tools they use.**

Atls checks every tool call a coding agent makes against your policy before it runs, locks the MCP tool definitions the agent may use, and writes an Ed25519-signed, hash-chained receipt for every action. Atls Team gives an organization one policy, tool-change approvals, device management, an audit log and evidence exports that anyone can verify offline.

| Part | What it does |
| --- | --- |
| **Atls Guard** | Deterministic `allow` / `ask` / `deny` for shell commands, file paths, URLs, SQL, payments and leaked secrets, through a Claude Code `PreToolUse` hook or an MCP gateway. Errors never become allow. |
| **Atls Scan** | Finds MCP servers in Claude Code, Cursor and Claude Desktop configs; flags tool poisoning, hidden instructions, shadowing, invisible Unicode, unpinned packages, plain-http servers and secrets in configs. |
| **Atls Lock** | `atls.lock` pins the SHA-256 of every tool definition; a changed tool is hidden and denied until someone reviews the diff. |
| **Atls Receipts** | `atls.receipt/1`: signed, chained, hash-only by default; `atls verify` detects edits, deletions and reordering. |
| **Atls Team** | Next.js + Supabase web platform: orgs and roles, devices, server-verified receipts, policy simulator and versions, lock approvals, audit log, exports, public Atls Advisories. |

## Quick start: the CLI

```bash
pip install ./atls-cli          # Python ≥ 3.10, no dependencies
atls init                       # signing key + starter policy in ~/.atls
atls scan --discover            # check the MCP servers your agents can reach
atls hook install --write       # guard every Claude Code tool call
atls check "rm -rf ~"           # exit 2: deny (ATL-SH-001)
atls demo                       # a poisoned MCP server behind the gateway
atls verify                     # every signature and link in your ledger
```

More: [`atls-cli/README.md`](atls-cli/README.md) and the in-app docs at `/docs`.

## Quick start: Atls Team locally

```bash
npm ci
cp .env.example .env.local       # fill from `supabase status`
supabase start && supabase db reset
npm run dev                      # http://localhost:3000 — sign in as demo@atls.local / atls-demo-password (DEMO data)
```

Details: [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md).

## Deploy

Supabase → Vercel → GitHub, each with its own checklist:
[`deploy/supabase`](deploy/supabase/README.md) · [`deploy/vercel`](deploy/vercel/README.md) · [`deploy/github`](deploy/github/README.md) · overview in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Environment variables (names only; see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_GITHUB_ENABLED`, and server-only `SUPABASE_SECRET_KEY`, `ATLS_IP_HASH_SALT`.

## Repository layout

```
src/app/            Next.js pages (public site, auth, dashboard) and /api/v1 route handlers
src/components/     UI components
src/core/           pure logic: receipt verification, ingest, policy + simulator, evidence export, shared engine
src/server/         server-only: sessions, device auth, data access, rate limits, HTTP helpers, logging
src/lib/            env validation, Supabase clients, CSP, safe redirects
atls-cli/          the Python CLI (guard, scan, lock, receipts, hook, gateway, team sync) and its tests
supabase/           migrations (schema, RLS, functions), local seed, config, database tests
advisories/         Atls Advisories (OSV JSON, added by pull request)
deploy/             GitHub, Supabase and Vercel setup guides
docs/               architecture, threat model, API, data model, limitations, traceability
scripts/            advisories build, seed build, secret scan, brand check
```

## Tests

```bash
npm run verify         # lint, typecheck, Vitest (core, server, RLS on PGlite), engine fixtures, secret scan, brand check, build
npm run test:cli       # Python CLI tests (incl. cross-engine signature checks; needs Node)
npm run preview:html   # with the app running: writes atls-home-preview.html, the home page as one self-contained file
```

## Security in short

Defence in depth, not promises: edge firewall rules (Vercel), an in-app shield against floods and scanners, Postgres rate limits per IP, per account and per email recipient, optional CAPTCHA, two-factor authentication enforced by row-level security, append-only signed evidence. Details: `docs/ARCHITECTURE.md` (defence in depth), `docs/THREAT_MODEL.md`, `docs/SECURITY_LIMITATIONS.md`, and the firewall checklist in `deploy/vercel/README.md`.

## Limits

Atls is not a sandbox: its rules are deterministic pattern matching, and it only sees calls that pass through its hook or gateway. A receipt proves what Atls decided and that the record was not changed afterwards, not what a tool did internally. No independent penetration test has been done yet. Full list: [`docs/SECURITY_LIMITATIONS.md`](docs/SECURITY_LIMITATIONS.md). Security model: [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). Report vulnerabilities as described in [`SECURITY.md`](SECURITY.md).

## License

MIT. See [`LICENSE`](LICENSE).
