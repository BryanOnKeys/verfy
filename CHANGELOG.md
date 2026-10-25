# Changelog

What changed in the Verfy CLI (`pip install verfy`) and the website. Newest first. Every CLI version is on [PyPI](https://pypi.org/project/verfy/#history) and on the [GitHub releases page](https://github.com/anvarbekovjavohir277-dot/verfy/releases).

## 0.5.4 (2026-10-25)

- The hosted service has one name, Verfy Cloud: `verfy team` and `verfy sync` say so in their help. The commands are unchanged.
- This repository is now the MIT CLI only; the website and the dashboard are developed separately as Verfy Cloud. The CLI is MIT and will stay MIT.
- Verfy Advisories are open data in [`advisories/`](https://github.com/anvarbekovjavohir277-dot/verfy/tree/main/advisories): anyone can add a public, sourced advisory by pull request, checked by `node advisories/validate.mjs`.
- Contributors sign the [CLA](https://github.com/anvarbekovjavohir277-dot/verfy/blob/main/CLA.md) once, by commenting on their first pull request.

## 0.5.3 (2026-10-24)

- One tag now does the whole release in one workflow: tests, PyPI with attestations, then the GitHub release from this changelog with the same files, SHA256SUMS and Sigstore signatures. Only the newest version is marked "Latest".
- PyPI page links: Repository, Changelog and Releases.
- Verfy Cloud (website): Slack and Telegram notifications for calls that wait for approval, changed tool definitions, denied calls and devices that stop uploading receipts for a day (Dashboard → Notifications).

## 0.5.2 (2026-10-24)

Scanner fixes, found by scanning the newest releases of 34 popular MCP servers ([the research](https://github.com/anvarbekovjavohir277-dot/verfy/blob/main/docs/research/2026-10-mcp-tool-changes.md)). Version 0.5.1 raised 163 high or critical findings there, all false alarms; 0.5.2 raises none.

- A tool that mentions another tool on the same server is no longer flagged as tool shadowing.
- A match right after a negation ("Do not include API keys") is skipped. Before, this hid tools from Context7, Apify and Sentry behind the gateway.
- "tokens" and "conversation" only count in their sensitive senses (access tokens, the conversation history).
- "silently" no longer counts as "secretly"; mentioning a file such as `.env` is medium instead of high.

## 0.5.1 (2026-10-24)

Fixes found while scanning public `.mcp.json` files and recording the demo video.

- `verfy lock check` and the gateway no longer crash with a traceback when a server's command cannot be started (for example an empty command). They report it and exit 3 (lock check) or 126 (gateway).
- Config scan: an unpinned package launched through `cmd /c` or `sh -c` is now reported.
- Config scan: `npx` of a package declared in the `package.json` next to the config is no longer reported, because the lockfile pins it.
- Config scan: VFY-CFG-007 (a remote server without credentials in the config) is now `info`. The client signs in with OAuth when the server asks, so a missing header is not a weakness.

## 0.5.0 (2026-10-24)

- Approval queue for teams. With `"on_ask": "team"`, a gateway call that needs approval waits in Dashboard → Approvals until an owner or admin decides, for up to `approval_timeout` seconds. Only the SHA-256 of the arguments leaves the machine.

## 0.4.0 (2026-10-24)

- The gateway replaces API keys, tokens and private keys in MCP tool results with `[REDACTED:<rule>]` before the agent reads them. Turn it off with `"redact_output": false`.
- Policy templates: `verfy policy use strict | read-only | ci`, and `verfy init --template`.
- Fixed: redaction of stored arguments hid only the first secret of each kind.
- Website: Next.js 16.4.3, which fixes two critical advisories.

## 0.3.0 (2026-10-22)

- Self-protection: the agent cannot switch Verfy off with its own tools (VFY-SELF-001 to 005).
- `verfy update`, and a choice between manual and automatic updates at `verfy init`.
- Windows paths are compared without regard to case, in the `/c/...` form.
- One-line installers that need no Python (standalone builds for Windows, macOS and Linux, checked against SHA256SUMS).

## 0.2.0 (2026-10-21)

- First release on PyPI as `verfy`: the Claude Code hook, the MCP gateway, `verfy scan`, `verfy lock` (including `lock check` and the GitHub Action for CI), signed receipts and SCITT export.

## Before PyPI (2026-10-14 to 2026-10-20)

- 2026-10-18: the website leads with Verfy Lock, with a rug-pull demo you can run in the browser.
- 2026-10-15: renamed from Atls to Verfy; Google and GitHub sign-in.
- 2026-10-14: first version of the guard, scanner, lock, signed receipts and the Team web app.
