# Security policy

## Reporting a vulnerability

Please report security issues **privately**:

Use GitHub → this repository → **Security** → **Report a vulnerability** (private vulnerability reporting, [direct link](https://github.com/anvarbekovjavohir277-dot/verfy/security/advisories/new)). Only the maintainers see the report.

A way for an agent to get past Verfy (a command, path or tool call that should be denied or asked about but is allowed) counts as a vulnerability: report it privately the same way.

Include the affected component (CLI, web app, database migration), the version or commit, steps to reproduce, and the impact you observed. Please do not open public issues for vulnerabilities.

We aim to acknowledge reports within 2 business days and to keep you informed until a fix is released. We will credit you in the release notes unless you prefer otherwise.

## Scope

In scope: this repository's code — the `verfy` CLI, the Next.js app and API, the Supabase migrations and RLS policies, CI configuration.

Out of scope: vulnerabilities in Supabase, Vercel or GitHub themselves (report to them), social engineering, denial-of-service testing against deployments you do not own, findings that require a fully compromised developer machine.

## Safe harbor

We will not pursue legal action against good-faith research that stays within this policy, avoids privacy violations and service degradation, does not access other people's data, and gives us reasonable time to fix the issue before disclosure.

## Supported versions

Only the latest release on `main` receives security fixes during the MVP phase.

See also: [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) and [`docs/SECURITY_LIMITATIONS.md`](docs/SECURITY_LIMITATIONS.md).
