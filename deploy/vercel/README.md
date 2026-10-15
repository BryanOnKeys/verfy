# Deploy: Vercel

The web app (public site, dashboard and `/api/v1`) is a standard Next.js 16 App Router project at the repository root. No `vercel.json` is needed: security headers are set in `next.config.ts`, the per-request Content-Security-Policy in `src/proxy.ts`.

Do the Supabase setup first (`deploy/supabase/README.md`).

## 1. Import the repository

1. <https://vercel.com/new> → import your GitHub repository.
2. **Framework preset**: Next.js (detected). **Root directory**: `.` (the repository root).
3. **Build command**: `npm run build` (default). **Install command**: `npm ci` (default with `package-lock.json`). **Output**: default.
4. **Node.js version** (Project Settings → Build and Deployment): 24.x (22.x also works; the app requires ≥ 20.9).

## 2. Environment variables

Project Settings → Environment Variables. Add each for **Production** and **Preview** (and Development if you use `vercel env pull`).

| Name | Value | Exposed to browser? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | yes (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | yes (public; RLS protects data) |
| `NEXT_PUBLIC_APP_URL` | `https://verfy.example.com` (no trailing slash). For Preview, the preview URL or your preview domain | yes |
| `NEXT_PUBLIC_AUTH_GITHUB_ENABLED` | `false` (set `true` only after GitHub works in Supabase) | yes |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` — mark **Sensitive** | **no, server only** |
| `ATLS_IP_HASH_SALT` | random, ≥ 32 characters (`openssl rand -base64 48`) — mark **Sensitive** | **no, server only** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | optional: your Cloudflare Turnstile **site** key. When set, sign-in, sign-up and password-reset forms show a CAPTCHA. The Turnstile **secret** key goes into Supabase (see `deploy/supabase/README.md`), not here | yes (public) |

Rules:

- Anything starting with `NEXT_PUBLIC_` is copied into the JavaScript sent to browsers. Never give a secret that prefix. ESLint and `npm run check:secrets` (which scans the built bundle) guard against it.
- `NEXT_PUBLIC_*` values are inlined at **build** time: after changing them, redeploy.
- If a server variable is missing, API routes answer `503 not_configured` and pages show a setup notice; nothing silently runs without protection.
- Use a separate Supabase project for Preview if previews should not touch production data.

## 3. Deploy and connect Supabase Auth

1. Deploy. Note the production URL.
2. In Supabase → Authentication → URL Configuration, make sure **Site URL** and the `/auth/callback` and `/auth/confirm` redirect URLs use that exact domain.

## 4. Custom domain

Project Settings → Domains → add `verfy.example.com` and create the DNS record Vercel shows (CNAME to `cname.vercel-dns.com`, or the A record for an apex domain). HTTPS certificates are automatic. Then update `NEXT_PUBLIC_APP_URL` and the Supabase URLs to the custom domain and redeploy.

## 5. Smoke test after every production deploy

```bash
APP=https://verfy.example.com
curl -s $APP/api/health                      # {"ok":true,...,"configured":true}
curl -sI $APP/ | grep -iE "content-security-policy|strict-transport-security|x-frame-options"
curl -s "$APP/api/v1/advisories" | head -c 200
curl -s -X POST $APP/api/v1/receipts/batch -H "content-type: application/json" -d '{}'   # 401 problem+json
```

Then in a browser: sign up → confirm email → create an organization → Devices → Add a device → on a laptop:

```bash
pip install ./verfy-cli && verfy init
verfy team enroll --url $APP --code <code>
verfy check "npm test" && verfy hook install --write
verfy sync
```

The receipts appear under Receipts; "Verify the whole chain on the server" reports all signatures valid.

## 6. Firewall rules (do this before you announce the site)

Volumetric DDoS (floods of traffic at the network or HTTP level) is absorbed by Vercel's network before it reaches the app; no application code can do that. What you add here are rules that turn away abusive traffic at Vercel's edge, so it never costs a function invocation. Open **Project → Firewall → Configure → Add New… → Rule**, create each rule with the **Log** action first, watch the live traffic for a few minutes, then switch it to the action shown. (Rate-limit rules and persistent actions depend on your plan; see <https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules>.)

| # | Name | If | Then |
| --- | --- | --- | --- |
| 1 | Block odd methods | Request method is one of `TRACE`, `TRACK`, `CONNECT` | **Deny** |
| 2 | Block scanner paths | Path matches `\.(env|git|svn|aws|ssh)(/|$)` or ends with `.php` or starts with `/wp-` | **Deny** (persistent 1 hour if your plan has it) |
| 3 | Sign-in pages | Method is `POST` and path starts with `/auth/` | **Rate limit** 20 requests / 60 s per IP → **Deny** (persistent 15 min) |
| 4 | Device enrollment | Path is `/api/v1/devices/enroll` | **Rate limit** 10 / 60 s per IP → **Deny** |
| 5 | API | Path starts with `/api/` | **Rate limit** 600 / 60 s per IP → **Deny** (429) |

Also, in **Firewall**: turn on the managed **Bot Protection** ruleset if your plan offers it, keep **Attack Challenge Mode** in mind for incidents (it challenges every visitor until you turn it off), and in **Settings → Billing** set a spend limit so an attack cannot run up costs.

Rule 1 matters because Next.js itself cannot represent `TRACE` requests and answers them with a generic error before any Verfy code runs; nothing leaks, but the edge is the right place to refuse them.

## What protects the deployment, and where it is configured

| Protection | Where | Configured by |
| --- | --- | --- |
| DDoS mitigation (L3/L4/L7) | Vercel platform firewall, all plans | automatic |
| WAF custom rules, rate limits at the edge, IP blocking, bot protection, Attack Challenge Mode | Vercel → Project → Firewall | **you, in the dashboard** (section 6 above) |
| First-line shield: per-IP flood limits, scanner-path 404s, method and URL-length checks, before any database work | `src/lib/shield.ts` (used by `src/proxy.ts` and every API route) | code |
| Client IP that cannot be spoofed (Vercel's `x-real-ip`) for every limit | `clientIp()` in `src/lib/shield.ts` | code |
| Per-account and per-recipient limits against credential stuffing and email bombing; failed device-token limits | `src/app/auth/actions.ts`, `src/server/device-auth.ts`, `src/server/ratelimit.ts` | code |
| Two-factor authentication (TOTP), enforced by the database | `src/app/auth/mfa-actions.ts`, `supabase/migrations/20261012000200_mfa.sql` | code; users turn it on in Settings |
| Optional CAPTCHA (Cloudflare Turnstile) on sign-in, sign-up and reset | `src/components/captcha.tsx`, Supabase Auth | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + Supabase dashboard |
| Query timeouts for browser-reachable roles | `supabase/migrations/20261012000100_hardening.sql` | code |
| TLS / HSTS | Vercel certificates + `Strict-Transport-Security` header (`next.config.ts`) | code + automatic |
| CSP with per-request nonce, frame blocking, nosniff, referrer and permissions policies | `src/proxy.ts`, `next.config.ts` | code |
| Application rate limits shared across instances (sign-in, enrollment, ingest, exports, public feed) | `src/server/ratelimit.ts` + `public.rate_limit_hit` in Postgres | code |
| CSRF (Origin check on cookie-authenticated changes; Server Actions check Origin too) | `src/server/http.ts`, Next.js | code |
| Tenant isolation | Supabase RLS + server checks | code (migrations) |
| Body size limits, schema validation, safe errors | `src/server/http.ts`, zod schemas in each route | code |
| Log redaction | `src/server/log.ts`; logs go to Vercel → Logs (add a Drain for a SIEM) | code + dashboard |

Verfy does not claim protection it cannot see: whether WAF rules are enabled, which plan limits apply, and alerting are decisions you make in the Vercel dashboard.

## Rollback

Vercel → Deployments → pick the last good deployment → **Promote to Production** (instant). Database migrations are not rolled back by this; see `deploy/supabase/README.md`.
