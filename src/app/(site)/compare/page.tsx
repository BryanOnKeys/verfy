import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verfy and MCP scanners",
  description: "What Snyk Agent Scan, Cisco MCP Scanner and Trail of Bits mcp-context-protector do, and what Verfy adds, from each project's own documentation.",
};

const CHECKED = "24 October 2026";

const TOOLS = [
  { name: "Snyk Agent Scan", note: "formerly Invariant Labs mcp-scan", href: "https://github.com/snyk/agent-scan" },
  { name: "Cisco MCP Scanner", note: "cisco-ai-defense", href: "https://github.com/cisco-ai-defense/mcp-scanner" },
  { name: "mcp-context-protector", note: "Trail of Bits", href: "https://github.com/trailofbits/mcp-context-protector" },
  { name: "Verfy", note: "this project", href: "https://github.com/anvarbekovjavohir277-dot/verfy" },
];

// One row per question; one cell per tool, in TOOLS order. Only what each project documents.
const ROWS: [string, string[]][] = [
  [
    "What it is",
    [
      "Scanner for MCP servers, tools and agent skills; optional Agent Guard hooks",
      "Scanner for MCP servers, tools, server source code and packages",
      "Wrapper that sits between the client and an MCP server",
      "Tool lock, a Claude Code hook, an MCP gateway and signed receipts",
    ],
  ],
  [
    "How tools are judged",
    [
      "Local checks plus the Snyk Agent Scan API",
      "YARA rules locally; optional LLM analyzer and Cisco AI Defense API",
      "Pinning; optional guardrail provider (e.g. LlamaFirewall) for tool responses",
      "Deterministic local rules; no language model decides",
    ],
  ],
  ["Account or API key", ["Snyk account and SNYK_TOKEN", "Optional (YARA works without one)", "Not for pinning", "None"]],
  [
    "Tool descriptions leave your machine",
    ["Yes, to the Snyk API (secrets redacted first)", "Only with the LLM or AI Defense analyzers", "Not for pinning", "No"],
  ],
  [
    "Notices a tool that changed after you approved it",
    ["Not described in its docs", "Not described in its docs", "Yes: trust-on-first-use pinning, unapproved changes blocked", "Yes: verfy.lock, changed tools hidden and denied"],
  ],
  [
    "Fails a pull request when a tool changed",
    ["Has a CI mode for scan findings; tool changes not described", "Offline mode for scanning saved tool lists in CI", "Not described", "Yes: a lock file in the repository, checked by verfy lock check and a GitHub Action"],
  ],
  [
    "Checks tool calls as they happen",
    [
      "Agent Guard hooks for Claude Code, Cursor, Codex and Copilot; the answer comes from the Snyk API",
      "No, it scans",
      "Blocks unapproved servers; guardrails can quarantine tool responses",
      "Claude Code hook for every tool call, gateway for MCP tools; local answers",
    ],
  ],
  ["Signed record of each checked call", ["Not described", "No", "Not described", "Yes: Ed25519-signed, hash-chained receipts; SCITT export"]],
  ["License", ["Apache-2.0", "Apache-2.0", "Apache-2.0", "MIT"]],
];

export default function ComparePage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head">
        <span className="eyebrow">Compare</span>
        <h1>Verfy and MCP scanners</h1>
        <p className="lead">
          Scanners judge a tool when you scan it. Verfy is built for what happens after: the tool changes, the agent calls it, and someone later asks
          what ran. This page puts the tools side by side, using only what each project documents. We checked it on {CHECKED}; tell us if something has
          changed.
        </p>
      </header>

      <div className="glass table-wrap" data-light>
        <table className="table">
          <caption className="visually-hidden">Verfy compared with MCP scanners</caption>
          <thead>
            <tr>
              <th scope="col">Question</th>
              {TOOLS.map((t) => (
                <th key={t.name} scope="col">
                  <a href={t.href} target="_blank" rel="noopener noreferrer">
                    {t.name}
                  </a>
                  <div className="small muted" style={{ fontWeight: 400 }}>
                    {t.note}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([q, cells]) => (
              <tr key={q}>
                <th scope="row" className="small">
                  {q}
                </th>
                {cells.map((c, i) => (
                  <td key={i} className="small text-2">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <section className="glass card-lg stack" aria-labelledby="they-h" data-light>
          <h2 id="they-h" style={{ fontSize: "1.2rem" }}>
            What they do that Verfy does not
          </h2>
          <ul className="stack text-2" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Snyk Agent Scan also scans agent skills, finds more agents, and judges text with its analysis service.</li>
            <li>Cisco MCP Scanner reads server source code, scans packages in a sandbox, checks bundled files on VirusTotal and can ask a language model.</li>
            <li>mcp-context-protector can run a guardrail model over every tool response and quarantine suspicious ones.</li>
            <li>Verfy&apos;s rules are pattern matching: it will miss what a model or a code analyzer might catch.</li>
          </ul>
        </section>
        <section className="glass card-lg stack" aria-labelledby="us-h" data-light>
          <h2 id="us-h" style={{ fontSize: "1.2rem" }}>
            What Verfy adds
          </h2>
          <ul className="stack text-2" style={{ paddingLeft: 18, margin: 0 }}>
            <li>A lock file you commit, so a changed tool fails the pull request for the whole team, not only on one laptop.</li>
            <li>A check of every Claude Code tool call (shell, files, network), not only MCP tools, with no account and nothing sent anywhere.</li>
            <li>A signed, hash-chained receipt for every checked call that anyone can verify offline.</li>
            <li>Team approvals for tool changes and for calls that need a person.</li>
          </ul>
        </section>
      </div>

      <p className="small muted">
        They work together: run a scanner when you add a server, and Verfy to notice when it changes and to check what the agent does with it. Other
        open-source projects that hold back unreviewed servers or tools include{" "}
        <a href="https://github.com/smart-mcp-proxy/mcpproxy-go" target="_blank" rel="noopener noreferrer">
          MCPProxy
        </a>
        . See also <Link href="/security">what Verfy does not cover</Link>.
      </p>
    </div>
  );
}
