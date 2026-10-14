# Deployment

Atls Team runs on three services. Set them up in this order; each has its own step-by-step guide:

1. **Supabase** — database, auth, storage: [`deploy/supabase/README.md`](../deploy/supabase/README.md)
2. **Vercel** — the Next.js app: [`deploy/vercel/README.md`](../deploy/vercel/README.md)
3. **GitHub** — source, CI, security scanning, branch protection: [`deploy/github/README.md`](../deploy/github/README.md)

(In practice you push to GitHub first so Vercel can import the repository; the guides cover that.)

## Environment variables

| Variable | Where | Secret? | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (all environments) | no | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | no (public by design; RLS protects data) | Supabase publishable key (or legacy anon key) |
| `NEXT_PUBLIC_APP_URL` | Vercel | no | Public URL of the app, used for redirects, invitation links and cookie `Secure` flag |
| `NEXT_PUBLIC_AUTH_GITHUB_ENABLED` | Vercel | no | `true` only after GitHub OAuth is configured in Supabase |
| `SUPABASE_SECRET_KEY` | Vercel, **server only** | **yes** | Supabase secret key (or legacy service_role key); bypasses RLS |
| `ATLS_IP_HASH_SALT` | Vercel, **server only** | **yes** | Salt for hashing client IPs in rate limits (≥ 32 chars) |
| GitHub OAuth client ID / secret | **Supabase dashboard** (Auth → Providers → GitHub) | secret | Not used by the app directly |

Nothing else is needed. The app refuses to run API routes without the server variables (`503 not_configured`) and shows a setup notice on pages.

## Deploy-ready vs deployed

This repository is deploy-ready: migrations, app, CLI and CI are complete and tested locally. Creating the Supabase project, the Vercel project and the GitHub repository needs your accounts and cannot be done from the repository. After you finish the three guides, run the smoke test in `deploy/vercel/README.md`.

## Release checklist

- [ ] `npm run verify` passes locally; CI is green on `main`.
- [ ] `supabase migration list` shows all migrations applied in production.
- [ ] Supabase Security Advisor: no errors.
- [ ] Vercel env vars set for Production and Preview; secrets marked Sensitive.
- [ ] Supabase Auth Site URL and redirect URLs match the production domain.
- [ ] Smoke test passes (health, headers, advisories, sign-up → org → device → sync → verify).
- [ ] Vercel Firewall: rate-limit rule on `/auth/*` and `/api/v1/devices/enroll` reviewed; you know how to enable Attack Mode.
- [ ] `SECURITY.md` contact is filled in and private vulnerability reporting is on.
