# Deploy: GitHub

The repository root is the whole project: the web app, the Supabase migrations, the Python CLI, docs and CI. Push it as one repository.

## 1. What must (and must not) be in the repository

Committed:

- `src/`, `public/`, `supabase/` (migrations, seed for local dev, tests), `verfy-cli/`, `advisories/`, `scripts/`, `docs/`, `deploy/`, `tests/`
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`
- `README.md`, `LICENSE` (MIT), `SECURITY.md`, `.gitignore`, `.env.example`
- `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/dependabot.yml`

Never committed (already in `.gitignore`): `.env`, `.env.local` and every other `.env.*` except `.env.example`; `node_modules/`, `.next/`; `.verfy/`, `key.json`, `team.json`, `*.jsonl` ledgers; `*.pem`, `*.key`; `.vercel/`.

Before the first push, run:

```bash
npm ci
npm run verify          # lint, typecheck, tests, engine fixtures, secret scan, brand check, build
git status              # make sure no .env or key files are listed
```

## 2. Create the repository and push

```bash
git init -b main                     # skip if the folder is already a repository
git add .
git commit -m "Verfy MVP"
git remote add origin git@github.com:<you>/verfy.git
git push -u origin main
```

**Public or private?** The CLI and the web app are MIT-licensed and contain no secrets, so a public repository is fine and lets others verify the code. Keep it private if your deployment's configuration or roadmap should not be visible. Either way, secrets live only in Vercel and Supabase.

## 3. Repository settings

**Settings → Code security**

- [ ] Dependabot alerts and Dependabot security updates: on (version updates are configured in `.github/dependabot.yml`).
- [ ] Secret scanning and push protection: on.
- [ ] Private vulnerability reporting: on (referenced by `SECURITY.md`).
- [ ] Code scanning: the `CodeQL` job in `security.yml` uploads results.

**Settings → Branches → Add branch ruleset for `main`**

- [ ] Require a pull request before merging (1 approval once you have a second maintainer).
- [ ] Require status checks: `Web app, database and shared engine`, `Verfy CLI (Python 3.13)`, `Dependency audit`, `Secret scan`.
- [ ] Block force pushes and deletions.
- [ ] Require signed commits (optional).

**Settings → Actions → General**: workflow permissions "Read repository contents" (the workflows request only what they need).

## 4. Secrets for GitHub Actions

None are required: CI runs every test against PGlite and never touches your Supabase project or Vercel. Do not add your Supabase secret key to GitHub.

If you later add a deploy workflow, store `VERCEL_TOKEN` etc. under Settings → Secrets and variables → Actions, and never `echo` them in a step.

## 5. What CI runs

| Workflow | Job | Checks |
| --- | --- | --- |
| `ci.yml` | Web app, database and shared engine | `npm ci`, ESLint, `tsc --noEmit`, Vitest (core, server helpers, RLS/tenant-isolation and seed tests on PGlite), JS engine fixtures, advisory validation, old-name check, `next build`, secret scan of repo and browser bundle |
| `ci.yml` | Verfy CLI | Python 3.10 / 3.12 / 3.13 on Linux, 3.13 on Windows and macOS: unit, gateway, hook, lock, team and cross-engine tests (pure-Python Ed25519), install, `verfy demo` |
| `security.yml` | Dependency audit | `npm audit --omit=dev --audit-level=high`, `pip-audit` |
| `security.yml` | Secret scan | TruffleHog (verified secrets, full history) and `scripts/check-secrets.mjs` |
| `security.yml` | CodeQL | JavaScript/TypeScript and Python |

## Rollback

Revert the commit (`git revert <sha>`) and push; Vercel redeploys `main`. Use Vercel's "Promote to Production" for an instant rollback while the revert runs through CI.
