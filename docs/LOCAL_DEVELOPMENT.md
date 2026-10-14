# Local development

## Requirements

- Node.js ≥ 20.9 (24 recommended) and npm
- Python ≥ 3.10 (for the CLI)
- For the full stack locally: the Supabase CLI and Docker (Supabase runs Postgres, Auth and Storage in containers)

## 1. Install

```bash
npm ci
cp .env.example .env.local
```

## 2. Start Supabase locally

```bash
supabase start          # first run downloads the containers
supabase db reset       # LOCAL ONLY: applies supabase/migrations and supabase/seed.sql
supabase status         # prints the local API URL and keys
```

Fill `.env.local` from `supabase status`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from supabase status>
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SECRET_KEY=<secret key from supabase status>
ATLS_IP_HASH_SALT=<any random string of 32+ characters>
```

Local email (sign-up confirmations, magic links) is captured by Inbucket at <http://127.0.0.1:54324>.

## 3. Run the app

```bash
npm run dev             # http://localhost:3000
```

Sign in with the seeded **DEMO** account: `demo@atls.local` / `atls-demo-password`. Its organization, device and four receipts are labelled DEMO; the receipts are real signatures made with the published test key in `atls-cli/tests/fixtures/receipts.json`, so chain verification passes on them.

## 4. The CLI against your local app

```bash
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ./atls-cli
export ATLS_HOME=$PWD/.atls                         # keeps your real ~/.atls untouched
atls init
# Dashboard → Devices → Add a device, then:
atls team enroll --url http://localhost:3000 --code atle_…
atls check "rm -rf ~"; atls check "npm test"
echo '{"tool_name":"Bash","tool_input":{"command":"git push --force"},"session_id":"dev"}' | atls hook pre-tool-use
atls sync && atls team pull
```

`http://` team URLs are accepted only for `localhost`/`127.0.0.1`.

## 5. Tests

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest: core (receipts, ingest, policy, simulator, evidence, diff), server helpers (errors, CSRF, body limits, log redaction), database tests on PGlite (migrations, RLS, roles, ingest, audit chain, seed, advisories) |
| `npm run test:engine` | The JS engine against the shared fixtures (125 checks) |
| `npm run test:cli` | Python CLI: 50+ tests incl. gateway, hook, lock, team sync, cross-process ledger, cross-engine signatures |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run check:secrets` / `npm run check:brand` | secret scan (repo + bundle) / no old product names |
| `npm run verify` | all of the above plus `next build` |

After a deliberate rule change, regenerate the fixtures and review the diff:

```bash
python atls-cli/tests/make_fixtures.py
python atls-cli/tests/make_receipt_vectors.py
node scripts/build-seed.mjs
```

After adding an advisory under `advisories/`, run `node scripts/advisories.mjs --write`.

## Database changes

Create a new file in `supabase/migrations/` (never edit one that has been deployed), run `supabase db reset` locally, add or update tests in `supabase/tests/`, then `npm test`.
