# Verfy CLI

Guard coding-agent tool calls, scan and lock MCP tools, and sign a verifiable receipt for every action. Plain Python (≥ 3.10), no required dependencies, MIT.

```bash
pip install ./verfy-cli            # from the Verfy repository
pip install "./verfy-cli[fast]"    # optional: faster Ed25519 via `cryptography`
```

## Guard Claude Code

```bash
verfy init                      # ~/.verfy: signing key (0600), starter policy
verfy hook install              # shows the change to ~/.claude/settings.json
verfy hook install --write      # saves it (a backup is kept); --project for ./.claude/settings.json
```

Claude Code then runs `verfy hook pre-tool-use` before every tool call. Verfy answers **deny** or **ask** with the rule and reason, or stays silent so Claude Code's own permissions decide; it never answers allow itself. Any error becomes `ask` (or `deny` with `"fail_mode": "deny"`). The hook never touches the network.

## Guard MCP servers (gateway)

```bash
claude mcp add filesystem -- verfy proxy --name filesystem -- npx -y @modelcontextprotocol/server-filesystem@2025.8.21 ~/project
verfy wrap ~/.cursor/mcp.json --write      # wrap every server in a config (backup kept)
```

The gateway scans each `tools/list` answer, hides poisoned or drifted tools, checks every `tools/call`, can ask the user through MCP elicitation (`"on_ask": "elicit"`), and writes a receipt for every call.

## Scan

```bash
verfy scan --discover                 # static check of Claude Code, Cursor, Claude Desktop configs
verfy scan --discover --live          # also start each stdio server and scan its tools
verfy scan tools.json --fail-under C  # a saved tools/list answer, for CI
```

Exit codes: config scan `0` ok, `1` medium, `2` high or worse; tool scan `1` with `--fail-under` when a server grades worse.

## Lock

```bash
verfy lock status                 # 0 ok · 1 new/removed · 2 drift
verfy lock diff filesystem        # what changed, invisible characters spelled out
verfy lock approve filesystem     # review, then accept (--yes after reviewing in CI)
verfy lock add tools.json --server remote-api
verfy lock verify                 # verfy.lock is well formed and untampered
```

A project-level `./verfy.lock` is used when present, otherwise `~/.verfy/verfy.lock`.

## Check and verify

```bash
verfy check "git push --force"                       # 0 allow · 1 ask · 2 deny
verfy check --tool send_payment --args '{"amount": 500}'
verfy ledger show
verfy verify                                         # your own ledger
verfy verify --ledger receipts.jsonl --pub <key> --kid <chain> [--start-after <hash>]   # an evidence export
```

## Verfy Team

```bash
verfy team enroll --url https://verfy.example.com --code atle_…   # code from Dashboard → Devices
verfy sync                     # upload new receipts (run from cron/CI, never in the hook)
verfy team pull                # team policy + team-approved locks
verfy team propose SERVER TOOL # ask admins to approve a changed tool
verfy team status
```

Only the public key is sent at enrollment. The device token is stored in `~/.verfy/team.json` (0600). Receipts are uploaded exactly as signed; they contain only hashes of arguments unless you enabled `receipts.include_args`, in which case `sync` needs `--allow-args`.

## Policy

JSON merged over `src/verfy/data/default_policy.json`. Precedence: `--policy FILE`, `./verfy.policy.json`, `~/.verfy/team/policy.json`, `~/.verfy/policy.json`.

```json
{
  "on_ask": "deny",
  "fail_mode": "ask",
  "tools": {"deny": ["github/delete_*"], "ask": ["merge_pull_request"]},
  "network": {"allow": ["github.com", "*.python.org"], "unknown": "ask"},
  "rules": [{"id": "no-prod-db", "pattern": "prod-db", "verdict": "deny", "message": "Production is off-limits."}],
  "lock": {"on_new": "ask"},
  "receipts": {"include_args": false}
}
```

## Receipt format (`verfy.receipt/1`)

One JSON object per line in `~/.verfy/ledger.jsonl`: `v, id, seq, prev, issued_at, agent, session, action{server, tool, kind, args_sha256, args?}, decision{verdict, rules, policy_sha256, approved_by?}, outcome{status, result_sha256}, tool_sha256, kid, sig`. `sig` is Ed25519 over the canonical JSON of all other fields; `prev` is the SHA-256 of the previous receipt. Writes are serialized with an OS file lock, so parallel sessions never fork the chain.

## Tests

```bash
cd verfy-cli && python -m unittest discover -s tests     # needs Node for the cross-engine tests
```

## Limits

Rules are pattern matching, not a sandbox. Verfy sees only calls that pass through its hook or gateway. A receipt proves what Verfy decided and that the log was not edited, not what a tool did internally. Keep `~/.verfy/key.json` private.
