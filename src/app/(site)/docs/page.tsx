import type { Metadata } from "next";
import { CodeBlock } from "@/components/copy-button";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Docs",
  description: "Install the Atls CLI, guard Claude Code, scan and lock MCP tools, verify receipts and connect devices to Atls Team.",
};

const CLI: [string, string, string][] = [
  ["atls init", "Create a signing key and a starter policy in ~/.atls", "0"],
  ["atls scan --discover", "Static check of the MCP servers in your Claude Code, Cursor and Claude Desktop configs", "0 ok · 1 medium · 2 high or worse"],
  ["atls scan --discover --live", "Also start each stdio server and scan its tool definitions", "0 · 1 with --fail-under"],
  ["atls scan FILE", "Scan a saved tools/list answer", "0 · 1 with --fail-under"],
  ["atls check \"CMD\"", "Pre-check one command or --tool NAME --args JSON without running it", "0 allow · 1 ask · 2 deny"],
  ["atls hook install --write", "Add the PreToolUse hook to ~/.claude/settings.json (--project for this repo)", "0"],
  ["atls hook pre-tool-use", "The hook entry point Claude Code calls (JSON on stdin and stdout)", "always 0"],
  ["atls proxy --name N -- CMD", "Run an MCP server behind the Atls gateway", "server's exit code"],
  ["atls wrap CONFIG --write", "Put every server in an MCP config behind the gateway (keeps a backup)", "0"],
  ["atls lock status | diff | approve | add | verify", "Inspect and approve tool definition changes in atls.lock", "status: 0 ok · 1 new · 2 drift"],
  ["atls verify", "Verify every signature and hash link in the local ledger", "0 ok · 1 failed"],
  ["atls ledger show", "List recent receipts", "0"],
  ["atls team enroll --url URL --code CODE", "Register this device's public key with your team", "0 · 4 on a team error"],
  ["atls sync", "Upload new receipts to Atls Team", "0 · 4 on a team error"],
  ["atls team pull", "Fetch the team policy and team-approved locks", "0"],
  ["atls team propose SERVER TOOL", "Ask admins to approve a changed tool definition", "0"],
];

const API: [string, string, string, string][] = [
  ["POST", "/api/v1/devices/enroll", "enrollment code", "Register a device public key; returns a device token once"],
  ["POST", "/api/v1/receipts/batch", "device token", "Upload up to 500 signed receipts (idempotent)"],
  ["GET", "/api/v1/policies/current", "device or member", "Current team policy"],
  ["PUT", "/api/v1/policies/current", "owner, admin", "Publish a policy (simulator runs first)"],
  ["POST", "/api/v1/policies/simulate", "member", "Compare a proposed policy with the current one"],
  ["GET", "/api/v1/locks", "device or member", "Team locks (?status=approved)"],
  ["POST", "/api/v1/locks/propose", "device token", "Propose a tool definition"],
  ["POST", "/api/v1/locks/{id}/approve · /reject", "owner, admin", "Decide a pending lock"],
  ["GET", "/api/v1/receipts", "member", "Search receipts"],
  ["GET", "/api/v1/chains/{chain}/verify", "member", "Re-verify a device chain on the server"],
  ["POST", "/api/v1/exports", "owner, admin, auditor", "Build an evidence export"],
  ["GET", "/api/v1/exports/{id}", "owner, admin, auditor", "Export status and 60-second download links"],
  ["GET", "/api/v1/advisories", "public", "Atls Advisories feed"],
];

export default function DocsPage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head">
        <span className="eyebrow">Docs</span>
        <h1>Quickstart</h1>
        <p className="lead">Guard a coding agent on your machine first. Connecting to Atls Team is optional and can come later.</p>
        <nav aria-label="On this page" className="row">
          {[
            ["#install", "Install"],
            ["#guard", "Guard Claude Code"],
            ["#mcp", "MCP servers"],
            ["#team", "Atls Team"],
            ["#policy", "Policy"],
            ["#cli", "CLI reference"],
            ["#api", "API"],
          ].map(([h, l]) => (
            <a key={h} href={h} className="btn btn-secondary btn-sm">
              <span>{l}</span>
            </a>
          ))}
        </nav>
      </header>

      <section id="install" className="stack" aria-labelledby="install-h">
        <h2 id="install-h">1. Install</h2>
        <p className="text-2">Python 3.10 or newer. No other dependencies (install the optional <code className="inline-code">cryptography</code> extra for faster signing).</p>
        <CodeBlock
          code={["# from a clone of the Atls repository", "$ pip install ./atls-cli", "$ atls init", "$ atls check \"git push --force\"   # exit 1: needs approval"].join("\n")}
        />
      </section>

      <section id="guard" className="stack" aria-labelledby="guard-h">
        <h2 id="guard-h">2. Guard Claude Code</h2>
        <p className="text-2">
          The hook checks every tool call before it runs and writes a signed receipt. Review the change first (without <code className="inline-code">--write</code> it only prints it).
        </p>
        <CodeBlock code={["$ atls hook install            # print the settings change", "$ atls hook install --write    # save it (backup kept)", "$ atls ledger show", "$ atls verify"].join("\n")} />
      </section>

      <section id="mcp" className="stack" aria-labelledby="mcp-h">
        <h2 id="mcp-h">3. Scan and lock MCP servers</h2>
        <CodeBlock
          code={[
            "$ atls scan --discover                       # static: how servers are launched",
            "$ atls wrap ~/.cursor/mcp.json --write       # put servers behind the gateway",
            "$ atls lock status                           # after first use, tools are locked",
            "$ atls lock diff filesystem                  # if a definition drifted",
            "$ atls lock approve filesystem               # review, then accept",
          ].join("\n")}
        />
      </section>

      <section id="team" className="stack" aria-labelledby="team-h">
        <h2 id="team-h">4. Connect to Atls Team</h2>
        <p className="text-2">
          In the dashboard, open <strong>Devices → Add device</strong> to get a one-time code (valid for one hour). Only the device&apos;s public key is sent.
        </p>
        <CodeBlock
          code={["$ atls team enroll --url https://atls.example.com --code atle_…", "$ atls sync            # run it from cron or CI; never inside the hook", "$ atls team pull       # team policy and approved locks"].join("\n")}
        />
      </section>

      <section id="policy" className="stack" aria-labelledby="policy-h">
        <h2 id="policy-h">Policy</h2>
        <p className="text-2">
          JSON merged over the defaults. Order of precedence: <code className="inline-code">./atls.policy.json</code>, then the team policy from{" "}
          <code className="inline-code">atls team pull</code>, then <code className="inline-code">~/.atls/policy.json</code>.
        </p>
        <CodeBlock
          copy={false}
          code={JSON.stringify(
            {
              on_ask: "deny",
              fail_mode: "ask",
              tools: { deny: ["github/delete_*"], ask: ["merge_pull_request"] },
              network: { allow: ["github.com", "*.python.org"], unknown: "ask" },
              rules: [{ id: "no-prod-db", pattern: "prod-db", verdict: "deny", message: "Production is off-limits." }],
              lock: { on_new: "ask" },
              receipts: { include_args: false },
            },
            null,
            2,
          )}
        />
      </section>

      <section id="cli" className="stack" aria-labelledby="cli-h">
        <h2 id="cli-h">CLI reference</h2>
        <div className="glass table-wrap">
          <table className="table">
            <caption className="visually-hidden">Atls CLI commands</caption>
            <thead>
              <tr>
                <th scope="col">Command</th>
                <th scope="col">What it does</th>
                <th scope="col">Exit codes</th>
              </tr>
            </thead>
            <tbody>
              {CLI.map(([c, d, e]) => (
                <tr key={c}>
                  <td><code className="mono small">{c}</code></td>
                  <td className="text-2">{d}</td>
                  <td className="small muted">{e}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="api" className="stack" aria-labelledby="api-h">
        <h2 id="api-h">API</h2>
        <p className="text-2">
          JSON over HTTPS. Errors use RFC 9457 <code className="inline-code">application/problem+json</code>. Full request and response schemas are in{" "}
          <code className="inline-code">docs/API.md</code>.
        </p>
        <div className="glass table-wrap">
          <table className="table">
            <caption className="visually-hidden">Atls API endpoints</caption>
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Path</th>
                <th scope="col">Who</th>
                <th scope="col">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {API.map(([m, p, w, d]) => (
                <tr key={m + p}>
                  <td><span className="badge badge-info">{m}</span></td>
                  <td><code className="mono small">{p}</code></td>
                  <td className="small text-2">{w}</td>
                  <td className="small text-2">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="alert alert-info">
          <Icon name="info" size={16} />
          <span>Device tokens go in <code className="inline-code">Authorization: Bearer atd_…</code>. Session endpoints need the signed-in cookie and an <code className="inline-code">org</code> parameter.</span>
        </div>
      </section>
    </div>
  );
}
