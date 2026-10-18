# Positioning and the next 90 days

Written 2026-10-18. This is the plan the product and the website follow; change it here first.

## One user, one sentence

**For teams using Claude Code and Cursor: if a tool your agent uses changes in secret, Verfy stops it and proves every call.**

"A trust layer for AI agents" is too broad: platform vendors and large security companies can give that away. Verfy wins by being narrow, specific and provable.

## What leads

1. **Lock, not Scan.** Free MCP scanners already exist. What they do not do is catch a tool that changes after it was approved (a "rug pull"). The home page, the demo and the 60-second video all tell that story: the tool changes, Verfy blocks it, the receipt checks out.
2. **The GitHub Action.** `verfy lock check` in CI fails a pull request when a tool changed. That is how a team installs Verfy and keeps it.
3. **Receipts on a standard.** Receipts export as IETF SCITT signed statements (COSE_Sign1). `verfy verify` stays free and open to everyone. The money is in audit-ready evidence exports, not in owning a format.

## Distribution

Security research instead of ads. Check 20–50 popular MCP servers and publish real findings as **Verfy Advisories** (OSV format, `ATLS-YYYY-NNNN` IDs, CVE IDs only as aliases; never call our own database "CVE"). Publish only what was reproduced, and tell the maintainer before publishing.

## Money

| Plan | Price | What |
| --- | --- | --- |
| CLI + GitHub Action | Free, MIT | Lock, CI check, Guard, Scan, receipts, `verfy verify`, SCITT export |
| Verfy Team (hosted) | $19 per seat per month, planned | Team policy, receipt archive, evidence exports for SOC 2 / EU AI Act reviews |

Payments through a merchant of record (Lemon Squeezy or Paddle). Not built yet: it needs an account owned by an adult founder or guardian, who also signs contracts.

## Not now

Insurance or guarantees, payment clearing, agent passports, a general trust registry, a big dashboard for everyone. Revisit only after the numbers below are real.

## 90-day targets

- 300+ installs
- 10 teams active every week
- 3 paying teams

If installs come but nobody pays: pivot to a CI check that MCP **tool authors** pay for (paths A and D of the pivot tree).
