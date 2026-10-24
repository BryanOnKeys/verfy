import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

export const metadata: Metadata = {
  title: "Features",
  description: "Verfy Lock, Receipts, Guard, Scan and the Team dashboard: what each part does and what it does not do.",
};

const SECTIONS: { id: string; icon: IconName; title: string; intro: string; items: [string, string][]; limits: string }[] = [
  {
    id: "lock",
    icon: "lock",
    title: "Verfy Lock",
    intro: "verfy.lock pins the SHA-256 of each tool's canonical name, description and input schema.",
    items: [
      ["Drift", "A tool whose definition changed is hidden from the agent and its calls are denied (VFY-TOOL-004) until someone approves the change."],
      ["New tools", "A tool added to an already locked server needs approval by default (VFY-TOOL-006)."],
      ["Review", "verfy lock diff shows a readable diff with invisible characters spelled out; verfy lock approve records who accepted it."],
      ["CI", "verfy lock check starts the servers in .mcp.json and compares them with the committed verfy.lock. The GitHub Action runs it on every pull request and fails the check when a tool changed."],
      ["Team", "Devices propose changes; an admin approves once in the dashboard and every device picks it up with verfy team pull."],
    ],
    limits: "A lock proves a definition did not change since it was approved. It says nothing about whether the approved definition was safe.",
  },
  {
    id: "receipts",
    icon: "receipt",
    title: "Verfy Receipts",
    intro: "Every decision becomes a verfy.receipt/1 record, signed with Ed25519 and chained with SHA-256.",
    items: [
      ["Contents", "Sequence number, previous hash, time, agent, session, server, tool, action kind, SHA-256 of the arguments, verdict, rule IDs, policy hash, tool digest and outcome."],
      ["Privacy", "Arguments and results are stored as hashes by default. Storing redacted arguments is an explicit local setting."],
      ["Verification", "verfy verify checks every signature and link offline. The Team server checks them again on upload and on demand."],
      ["Standard format", "verfy scitt export writes each receipt as an IETF SCITT signed statement (COSE_Sign1 with CWT claims), so a SCITT transparency service or any COSE library can check it. Verfy does not run a transparency service."],
    ],
    limits: "A receipt shows what passed through Verfy and that the record was not changed afterwards. It does not show what a tool did internally, or actions that bypassed the hook or gateway.",
  },
  {
    id: "guard",
    icon: "shieldCheck",
    title: "Verfy Guard",
    intro: "A deterministic pre-check for every tool call, through a Claude Code PreToolUse hook or the MCP gateway.",
    items: [
      ["Shell", "Recursive deletes of home, root or the project, disk formatting, fork bombs, force-push, publishing and deploy commands, sudo, curl-to-shell, reading secrets in a command that also uses the network."],
      ["Files", "Writes to protected paths (~/.ssh, /etc, git hooks, shell profiles, the Verfy folder), sensitive files such as .env and private keys, writes outside the project."],
      ["Network", "Cloud metadata endpoints, tunnels and request bins, credentials in URLs, an allow list for everything else."],
      ["Data and money", "Destructive SQL without a WHERE clause, payment limits, daily budgets, unknown recipients, secrets in arguments."],
      ["Your rules", "Tool deny/ask lists, custom regex rules per tool or argument, disabled rules, all in one JSON policy. Start from a template: strict, read-only or ci."],
      ["Secrets in output", "The MCP gateway replaces API keys, tokens and private keys in tool results with [REDACTED:rule] before the agent reads them. Output of Claude Code's built-in tools is not changed."],
      ["Self-protection", "The agent cannot switch Verfy off with its own tools: changing the hook settings, verfy.lock, the policy or the Verfy install is denied, and so is running verfy lock approve or uninstalling Verfy. Changes to MCP configs need approval."],
    ],
    limits: "Pattern matching is not a sandbox. Commands Verfy cannot classify are not assumed safe; pair Verfy with OS-level isolation for untrusted code.",
  },
  {
    id: "scan",
    icon: "scan",
    title: "Verfy Scan",
    intro: "Finds MCP servers in Claude Code (.mcp.json, ~/.claude.json), Cursor and Claude Desktop configs, and checks tool definitions.",
    items: [
      ["Config checks", "Unpinned npx/uvx packages, curl | sh launchers, plain-http remote servers, remote servers without auth, secrets written into configs, privileged containers."],
      ["Tool checks", "Hidden instructions and tool poisoning, references to other tools (shadowing), invisible Unicode, long encoded blobs, secrets, misleading read-only hints."],
      ["Results", "Each finding has a rule ID, severity, where it was found and what to do. --json output and exit codes for CI."],
    ],
    limits: "The config check is static and never starts a server. Fetching tool lists (--live) starts each stdio server you configured, only when you ask. A clean scan is not a guarantee that a tool is safe.",
  },
];

const TEAM: [IconName, string, string][] = [
  ["policy", "Policies with history", "Edit the team policy as JSON, validate it, and see every published version with who published it."],
  ["gauge", "Policy simulator", "Before publishing, Verfy replays a corpus of sample agent actions and refuses a policy that would block most everyday work."],
  ["lock", "Lock approvals", "Pending tool changes with the diff from the approved version; approve or reject, recorded in the audit log."],
  ["device", "Devices", "Enroll laptops and CI runners with one-time codes, see when they last synced, revoke one instantly."],
  ["receipt", "Receipts", "Search and filter by verdict, tool, device and date; open any receipt to see its signature check and chain position."],
  ["download", "Evidence exports", "JSONL plus a manifest with SHA-256 hashes and public keys, downloadable through 60-second links."],
  ["users", "Roles", "Owner, admin, member and auditor, enforced by Postgres row-level security, not just hidden buttons."],
  ["history", "Audit log", "A hash-chained, append-only record of every policy, member, device, lock and export change."],
];

export default function FeaturesPage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head">
        <span className="eyebrow">Features</span>
        <h1>What Verfy does, and where it stops</h1>
        <p className="lead">Each capability below lists its limits next to it. Verfy only claims what it can show.</p>
        <nav aria-label="On this page" className="row">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="btn btn-secondary btn-sm">
              <span>{s.title}</span>
            </a>
          ))}
          <a href="#team" className="btn btn-secondary btn-sm">
            <span>Verfy Team</span>
          </a>
        </nav>
      </header>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="glass card-lg stack reveal" aria-labelledby={`${s.id}-h`} data-light>
          <div className="row">
            <span className="pillar">
              <span className="icon-well">
                <Icon name={s.icon} size={22} />
              </span>
            </span>
            <h2 id={`${s.id}-h`} style={{ fontSize: "1.6rem" }}>
              {s.title}
            </h2>
          </div>
          <p className="lead">{s.intro}</p>
          <dl className="kv">
            {s.items.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd className="text-2">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="alert alert-info">
            <Icon name="info" size={16} />
            <span>
              <strong>Limits.</strong> {s.limits}
            </span>
          </div>
        </section>
      ))}

      <section id="team" aria-labelledby="team-h" className="stack-lg">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <span className="eyebrow">Verfy Team</span>
          <h2 id="team-h">The web platform</h2>
          <p className="lead">
            Runs on your own Vercel and Supabase projects, with row-level security on every table and an audit entry for every change made through the
            app. The <Link href="/security">security model</Link> shows how that is enforced and tested, and where it stops.
          </p>
        </div>
        <div className="grid-4">
          {TEAM.map(([icon, title, body], i) => (
            <div key={title} className={`glass card pillar reveal d${i % 4}`} data-light>
              <span className="icon-well cyan">
                <Icon name={icon} size={20} />
              </span>
              <h3>{title}</h3>
              <p className="text-2 small">{body}</p>
            </div>
          ))}
        </div>
        <div className="alert alert-info">
          <Icon name="info" size={16} />
          <span>
            <strong>Not built yet:</strong> verified-tool certification, insurance or guarantees, payment clearing, and a public tool registry. They are
            on the roadmap as later phases and are not part of this product today.
          </span>
        </div>
        <div className="row">
          <Link href="/auth/sign-up" className="btn btn-primary">
            <span>Create your team</span>
            <Icon name="arrowRight" size={16} className="arrow" />
          </Link>
          <Link href="/docs" className="btn btn-secondary">
            <span>Read the docs</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
