import type { Metadata } from "next";
import { CodeBlock } from "@/components/copy-button";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Docs",
  description: "Install the Verfy CLI, lock MCP tools and fail CI when one changes, guard Claude Code, verify and export receipts, and connect devices to Verfy Team.",
};

const CLI: [string, string, string][] = [
  ["verfy init", "Create a signing key and a starter policy in ~/.verfy", "0"],
  ["verfy scan --discover", "Static check of the MCP servers in your Claude Code, Cursor and Claude Desktop configs", "0 ok · 1 medium · 2 high or worse"],
  ["verfy scan --discover --live", "Also start each stdio server and scan its tool definitions", "0 · 1 with --fail-under"],
  ["verfy scan FILE", "Scan a saved tools/list answer", "0 · 1 with --fail-under"],
  ["verfy check \"CMD\"", "Pre-check one command or --tool NAME --args JSON without running it", "0 allow · 1 ask · 2 deny"],
  ["verfy hook install --write", "Add the PreToolUse hook to ~/.claude/settings.json (--project for this repo)", "0"],
  ["verfy hook pre-tool-use", "The hook entry point Claude Code calls (JSON on stdin and stdout)", "always 0"],
  ["verfy proxy --name N -- CMD", "Run an MCP server behind the Verfy gateway", "server's exit code"],
  ["verfy wrap CONFIG --write", "Put every server in an MCP config behind the gateway (keeps a backup)", "0"],
  ["verfy lock check", "Start the servers in .mcp.json and compare their tools with ./verfy.lock (for CI); --update writes reviewed changes", "0 ok · 1 new or removed · 2 drift · 3 a server did not answer"],
  ["verfy lock status | diff | approve | add | verify", "Inspect and approve tool definition changes in verfy.lock", "status: 0 ok · 1 new · 2 drift"],
  ["verfy verify", "Verify every signature and hash link in the local ledger", "0 ok · 1 failed"],
  ["verfy ledger show", "List recent receipts", "0"],
  ["verfy scitt export --out DIR", "Write each receipt as a SCITT signed statement (COSE_Sign1)", "0"],
  ["verfy scitt verify FILE…", "Check statements: COSE signature, subject and the receipt inside", "0 ok · 1 failed"],
  ["verfy team enroll --url URL --code CODE", "Register this device's public key with your team", "0 · 4 on a team error"],
  ["verfy sync", "Upload new receipts to Verfy Team", "0 · 4 on a team error"],
  ["verfy team pull", "Fetch the team policy and team-approved locks", "0"],
  ["verfy team propose SERVER TOOL", "Ask admins to approve a changed tool definition", "0"],
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
  ["GET", "/api/v1/advisories", "public", "Verfy Advisories feed"],
];

export default function DocsPage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head">
        <span className="eyebrow">Docs</span>
        <h1>Quickstart</h1>
        <p className="lead">Guard a coding agent on your machine first. Connecting to Verfy Team is optional and can come later.</p>
        <nav aria-label="On this page" className="row">
          {[
            ["#install", "Install"],
            ["#guard", "Guard Claude Code"],
            ["#mcp", "MCP servers"],
            ["#ci", "GitHub Action"],
            ["#scitt", "SCITT export"],
            ["#team", "Verfy Team"],
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
          code={["# from a clone of the Verfy repository", "$ pip install ./verfy-cli", "$ verfy init", "$ verfy check \"git push --force\"   # exit 1: needs approval"].join("\n")}
        />
      </section>

      <section id="guard" className="stack" aria-labelledby="guard-h">
        <h2 id="guard-h">2. Guard Claude Code</h2>
        <p className="text-2">
          The hook checks every tool call before it runs and writes a signed receipt. Review the change first (without <code className="inline-code">--write</code> it only prints it).
        </p>
        <CodeBlock code={["$ verfy hook install            # print the settings change", "$ verfy hook install --write    # save it (backup kept)", "$ verfy ledger show", "$ verfy verify"].join("\n")} />
      </section>

      <section id="mcp" className="stack" aria-labelledby="mcp-h">
        <h2 id="mcp-h">3. Scan and lock MCP servers</h2>
        <CodeBlock
          code={[
            "$ verfy scan --discover                       # static: how servers are launched",
            "$ verfy wrap ~/.cursor/mcp.json --write       # put servers behind the gateway",
            "$ verfy lock status                           # after first use, tools are locked",
            "$ verfy lock diff filesystem                  # if a definition drifted",
            "$ verfy lock approve filesystem               # review, then accept",
          ].join("\n")}
        />
      </section>

      <section id="ci" className="stack" aria-labelledby="ci-h">
        <h2 id="ci-h">4. Fail the pull request when a tool changes</h2>
        <p className="text-2">
          Lock the servers your repository configures and commit the lock. In CI, <code className="inline-code">verfy lock check</code> starts each stdio
          server from <code className="inline-code">.mcp.json</code>, reads its tools and fails if any definition differs from{" "}
          <code className="inline-code">verfy.lock</code>. The diff appears in the log and as an annotation on the pull request.
        </p>
        <CodeBlock
          code={[
            "$ verfy lock check --update     # shows each definition and its scan findings, then writes verfy.lock",
            "$ git add verfy.lock .mcp.json && git commit -m \"Lock MCP tools\"",
          ].join("\n")}
        />
        <CodeBlock
          label=".github/workflows/verfy.yml"
          code={[
            "name: Verfy Lock",
            "on: [pull_request, push]",
            "permissions:",
            "  contents: read",
            "jobs:",
            "  lock:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - uses: actions/checkout@v7",
            "      - uses: actions/setup-python@v7",
            "        with:",
            "          python-version: \"3.13\"",
            "      - uses: anvarbekovjavohir277-dot/verfy@main   # not public yet; see the note below",
            "        with:",
            "          config: .mcp.json",
            "          lock: verfy.lock",
          ].join("\n")}
        />
        <p className="text-2 small">
          The check runs the server commands in your config, as your MCP client would, so pin package versions and pass any keys they need as CI
          secrets. Remote (HTTP) servers are skipped. The action lives in the Verfy repository, which is not public yet; until it is, copy{" "}
          <code className="inline-code">action.yml</code> and <code className="inline-code">verfy-cli/</code> into your own repository and use{" "}
          <code className="inline-code">uses: ./</code>.
        </p>
      </section>

      <section id="scitt" className="stack" aria-labelledby="scitt-h">
        <h2 id="scitt-h">Export receipts as SCITT signed statements</h2>
        <p className="text-2">
          Each receipt can be written as a COSE_Sign1 signed statement with CWT claims, the envelope the IETF SCITT architecture (an Internet-Draft)
          registers with a transparency service. Anyone with your public key can check one offline. Verfy does not run a transparency service.
        </p>
        <CodeBlock code={["$ verfy scitt export --out statements/ --issuer https://acme.example/devices/laptop-1", "$ verfy key --json > signer.json", "$ verfy scitt verify statements/*.cose --pub signer.json"].join("\n")} />
      </section>

      <section id="team" className="stack" aria-labelledby="team-h">
        <h2 id="team-h">5. Connect to Verfy Team</h2>
        <p className="text-2">
          In the dashboard, open <strong>Devices → Add device</strong> to get a one-time code (valid for one hour). Only the device&apos;s public key is sent.
        </p>
        <CodeBlock
          code={["$ verfy team enroll --url https://verfy.example.com --code atle_…", "$ verfy sync            # run it from cron or CI; never inside the hook", "$ verfy team pull       # team policy and approved locks"].join("\n")}
        />
      </section>

      <section id="policy" className="stack" aria-labelledby="policy-h">
        <h2 id="policy-h">Policy</h2>
        <p className="text-2">
          JSON merged over the defaults. Order of precedence: <code className="inline-code">./verfy.policy.json</code>, then the team policy from{" "}
          <code className="inline-code">verfy team pull</code>, then <code className="inline-code">~/.verfy/policy.json</code>.
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
            <caption className="visually-hidden">Verfy CLI commands</caption>
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
            <caption className="visually-hidden">Verfy API endpoints</caption>
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
