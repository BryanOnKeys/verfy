import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { AgentCoverage } from "@/components/agent-coverage";
import { CodeBlock } from "@/components/copy-button";
import { Icon, type IconName } from "@/components/icons";
import { HeroDemo } from "@/components/live-guard";
import { buildChain, consoleChain, judge, PRESET, RUG_UPDATE, rugPull, verifyChain } from "@/components/demo-chains";
import { LockDemo } from "@/components/lock-demo";
import { TamperDemo } from "@/components/proof";
import { TeamPreview } from "@/components/team-preview";

const enter = (n: number) => ({ "data-enter": "", style: { "--enter": n } as CSSProperties });

/** Splits a heading into words that rise one after another (globals.css, `.hero h1 .wd`). Screen readers read plain text. */
function Words({ text, from = 0 }: { text: string; from?: number }) {
  return text.split(" ").map((w, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className="wd">
        <span style={{ "--w": from + i } as CSSProperties}>{w}</span>
      </span>
    </Fragment>
  ));
}

const MODULES: { id: string; icon: IconName; tone?: string; name: string; title: string; body: string }[] = [
  {
    id: "lock",
    icon: "lock",
    tone: "violet",
    name: "Lock",
    title: "Tools can't change without you knowing",
    body: "Verfy pins the SHA-256 of each tool's exact definition when you approve it. If the server changes it later, the tool is blocked on every machine and the pull request fails in CI until a person reviews the diff.",
  },
  {
    id: "receipts",
    icon: "receipt",
    tone: "green",
    name: "Receipts",
    title: "A signed receipt for every checked call",
    body: "Every decision becomes a receipt, signed on the device with Ed25519 and chained with SHA-256. Anyone can check it with verfy verify, and it exports as a standard SCITT signed statement.",
  },
  {
    id: "guard",
    icon: "shieldCheck",
    name: "Guard",
    title: "Checks every step before it runs",
    body: "Shell commands, file writes, web requests, SQL and payments are checked against your policy. Every answer is allow, ask or deny, with the rule and the reason.",
  },
  {
    id: "scan",
    icon: "scan",
    tone: "cyan",
    name: "Scan",
    title: "A first look at new servers",
    body: "Flags hidden instructions, unpinned packages, plain-HTTP servers and leaked keys before you approve a tool. Use it next to any other scanner: a scan looks once, the lock keeps watching.",
  },
];

const FAQ: [string, string][] = [
  [
    "How is this different from an MCP scanner?",
    "A scanner reads a tool once. Verfy pins the exact definition you approved and checks it again on every connection and in CI. A tool that turns malicious after you approved it, a \"rug pull\", is blocked even though it passed the scan. Keep using any scanner you like alongside it.",
  ],
  [
    "Does an AI decide what my agent may do?",
    "No. Every verdict comes from deterministic rules: the same input always gets the same answer, and you can read, test and change the rules. No language model is ever asked whether something is allowed.",
  ],
  [
    "What happens if Verfy itself fails?",
    "It fails safe. A broken policy, an unreadable lock file or an internal error becomes \"ask\" (or \"deny\", if you choose). Verfy never lets an action through because something went wrong.",
  ],
  [
    "Does my code leave my computer?",
    "No. Checks run locally and never wait for the network. If you join a team, only receipts are uploaded, and by default they hold hashes of the arguments, not the arguments. Private keys never leave the device. Verfy itself goes online only when you run verfy update, or once a day if you turned on automatic updates, to ask GitHub or PyPI for the newest version number.",
  ],
  [
    "Can the agent switch Verfy off?",
    "Not through the tools Verfy checks. Editing Claude Code's hook settings, verfy.lock, the policy or the Verfy install is denied, and so is the agent running verfy lock approve to accept a changed tool for itself. Changes to MCP configs need your approval. A program the agent writes and then runs can still do things Verfy does not follow, which is why it is not a sandbox.",
  ],
  [
    "Is Verfy a sandbox?",
    "No. Verfy checks what passes through its hook or gateway. For untrusted code, use it together with OS-level isolation such as a container or a virtual machine.",
  ],
  [
    "Can someone with access to my machine rewrite the record?",
    "Not one record at a time: any edit, deletion or reordering makes the check fail at that spot. But whoever holds a device's private key could build a whole new chain from scratch and sign it, and that chain would check out on its own. That is why receipts sync to Verfy Team: the server keeps the hash of every receipt it has received and refuses a different one in the same place. A ledger that never left the machine has no such outside copy.",
  ],
  [
    "What does it cost?",
    "Today everything is free: the CLI and the GitHub Action under the MIT license, and the self-hosted Verfy Team on your own Vercel and Supabase projects. A hosted Verfy Team (shared policy, receipt archive and audit-ready evidence exports) is planned at $19 per seat per month. It is not on sale yet.",
  ],
];

const FLOW_DESC =
  "A tool call from the coding agent goes to Verfy, which checks the policy and the tool lock and writes a signed receipt. Allowed calls continue to the tool; denied calls stop at Verfy, and the receipt is still written.";

const FLOW_ROWS = [
  ["1", "Policy", "allow · ask · deny"],
  ["2", "Lock", "tool digest matches"],
  ["3", "Receipt", "signed and chained"],
];

function FlowDiagram() {
  return (
    <svg className="flow-wide" viewBox="0 0 760 290" role="img" aria-labelledby="flow-t flow-d">
      <title id="flow-t">Where Verfy sits</title>
      <desc id="flow-d">{FLOW_DESC}</desc>
      <path className="wire-a" d="M180 100H260" />
      <path className="wire-a" d="M500 100H580" />
      <path className="wire-d" d="M380 170V228" />
      <rect className="box" x="300" y="228" width="160" height="44" rx="10" style={{ stroke: "var(--danger)" }} />
      <text className="m m-d" x="380" y="255" textAnchor="middle">
        DENIED · STOPS HERE
      </text>
      <circle className="pk" cx="190" cy="100" r="5" />
      <circle className="pk-deny" cx="190" cy="100" r="5" />
      <rect className="box" x="20" y="60" width="160" height="80" rx="12" />
      <text className="t" x="100" y="96" textAnchor="middle">
        Coding agent
      </text>
      <text className="s" x="100" y="116" textAnchor="middle">
        Claude Code, Cursor
      </text>
      <rect className="box-core" x="260" y="24" width="240" height="146" rx="14" />
      <text className="t" x="280" y="54">
        Verfy
      </text>
      <text className="m m-a" x="480" y="54" textAnchor="end">
        ON YOUR MACHINE
      </text>
      {FLOW_ROWS.map(([n, a, b], i) => (
        <g key={n} transform={`translate(280 ${80 + i * 28})`}>
          <circle className="row-dot" cx="4" cy="-4" r="3.5" />
          <text className="s" x="16" y="0" style={{ fill: "var(--text)", fontWeight: 600 }}>
            {a}
          </text>
          <text className="s" x="78" y="0">
            {b}
          </text>
        </g>
      ))}
      <rect className="box" x="580" y="60" width="160" height="80" rx="12" />
      <text className="t" x="660" y="96" textAnchor="middle">
        Tool or MCP server
      </text>
      <text className="s" x="660" y="116" textAnchor="middle">
        runs only if allowed
      </text>
    </svg>
  );
}

/** The same picture stacked top to bottom, for narrow screens (globals.css shows one or the other). */
function FlowDiagramTall() {
  return (
    <svg className="flow-tall" viewBox="0 0 320 384" role="img" aria-labelledby="flow-t2 flow-d2">
      <title id="flow-t2">Where Verfy sits</title>
      <desc id="flow-d2">{FLOW_DESC}</desc>
      <path className="wire-a" d="M160 72V112" />
      <path className="wire-a" d="M88 252V310" />
      <path className="wire-d" d="M236 252V310" />
      <rect className="box" x="70" y="12" width="180" height="60" rx="12" />
      <text className="t" x="160" y="39" textAnchor="middle">
        Coding agent
      </text>
      <text className="s" x="160" y="58" textAnchor="middle">
        Claude Code, Cursor
      </text>
      <rect className="box-core" x="16" y="112" width="288" height="140" rx="14" />
      <text className="t" x="36" y="142">
        Verfy
      </text>
      <text className="m m-a" x="284" y="142" textAnchor="end">
        ON YOUR MACHINE
      </text>
      {FLOW_ROWS.map(([n, a, b], i) => (
        <g key={n} transform={`translate(36 ${172 + i * 28})`}>
          <circle className="row-dot" cx="4" cy="-4" r="3.5" />
          <text className="s" x="16" y="0" style={{ fill: "var(--text)", fontWeight: 600 }}>
            {a}
          </text>
          <text className="s" x="84" y="0">
            {b}
          </text>
        </g>
      ))}
      <rect className="box" x="16" y="310" width="144" height="62" rx="12" />
      <text className="t" x="88" y="336" textAnchor="middle">
        Tool
      </text>
      <text className="s" x="88" y="356" textAnchor="middle">
        runs only if allowed
      </text>
      <rect className="box" x="168" y="310" width="136" height="62" rx="12" style={{ stroke: "var(--danger)" }} />
      <text className="m m-d" x="236" y="336" textAnchor="middle">
        DENIED
      </text>
      <text className="s" x="236" y="356" textAnchor="middle">
        stops here
      </text>
    </svg>
  );
}

// docs/research/2026-10-mcp-tool-changes.md
const RESEARCH: [string, string][] = [
  ["28 of 34", "servers that started changed a tool definition within their last few releases"],
  ["23 of 70", "patch releases changed a tool definition, so ^1.2.3 does not freeze what your agent reads"],
  ["15 of 34", "servers rewrote the description of an existing tool, the text the model follows"],
];

export default async function HomePage() {
  // both demos are computed here first, so the page is correct before (or without) JavaScript
  const chainRows = await buildChain();
  const [chainStates, consoleHashes, rugState] = await Promise.all([
    verifyChain(chainRows, false),
    consoleChain(PRESET.map((e) => ({ tool: e.tool, verdict: judge(e).verdict }))),
    rugPull(RUG_UPDATE),
  ]);
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="shell hero-grid">
          <div>
            <span className="chip" {...enter(0)}>
              <span className="chip-dot" aria-hidden="true" />
              For teams using Claude Code and Cursor
            </span>
            <h1 id="hero-title">
              <Words text="If a tool your agent uses changes in secret, Verfy stops it" />{" "}
              <em>
                <Words text="and signs a receipt for every call it checks." from={12} />
              </em>
            </h1>
            <div className="hero-actions" {...enter(2)}>
              <Link href="/docs#install" className="btn btn-primary btn-lg">
                <span>Install the CLI</span>
                <Icon name="arrowRight" size={17} className="arrow" />
              </Link>
              <Link href="/docs#ci" className="btn btn-lg">
                <Icon name="terminal" size={17} />
                <span>Add it to CI</span>
              </Link>
            </div>
            <ul className="hero-facts" {...enter(3)}>
              <li>
                <Icon name="check" size={15} /> Fails the pull request when a tool changes
              </li>
              <li>
                <Icon name="check" size={15} /> No AI decides what is allowed
              </li>
              <li>
                <Icon name="check" size={15} /> MIT-licensed CLI
              </li>
            </ul>
          </div>
          <div {...enter(4)}>
            <LockDemo initial={rugState} />
          </div>
        </div>
      </section>

      <section className="section section-rule" id="research" aria-labelledby="research-title">
        <div className="shell stack-lg">
          <div className="section-head split reveal">
            <span className="eyebrow">Our research, October 2026</span>
            <h2 id="research-title">Tool definitions change, often in patch releases</h2>
            <p className="lead">
              We installed the newest releases of 46 popular MCP servers on throwaway machines and compared the tools each release served. Nothing
              malicious turned up, but none of these changes were reviewed by the people whose agents read them.
            </p>
          </div>
          <div className="grid-3 reveal">
            {RESEARCH.map(([value, label]) => (
              <div key={label} className="glass card kpi" data-light>
                <span className="value">{value}</span>
                <span className="label">{label}</span>
              </div>
            ))}
          </div>
          <p className="small muted reveal">
            The same run found 163 false alarms in Verfy&apos;s own scanner, fixed in 0.5.2.{" "}
            <a href="https://github.com/anvarbekovjavohir277-dot/verfy/blob/main/docs/research/2026-10-mcp-tool-changes.md" target="_blank" rel="noopener noreferrer">
              Method, numbers and limits
            </a>
          </p>
        </div>
      </section>

      <section className="section section-rule" id="agents" aria-labelledby="agents-title">
        <div className="shell stack-lg">
          <div className="section-head split reveal">
            <span className="eyebrow">Works with</span>
            <h2 id="agents-title">What Verfy sees in each agent</h2>
            <p className="lead">Claude Code asks Verfy before every tool call. Other agents reach Verfy through their MCP servers, so it sees those tools and not the agent&apos;s built-in ones.</p>
          </div>
          <div className="reveal">
            <AgentCoverage />
          </div>
        </div>
      </section>

      <section className="section section-rule" id="product" aria-labelledby="product-title">
        <div className="shell">
          <div className="section-head split reveal">
            <span className="eyebrow">
              <span className="num">01</span> The product
            </span>
            <h2 id="product-title">Lock first. Proof for everything.</h2>
            <p className="lead">Scanners judge a tool on the day you add it. Verfy notices the day it changes, blocks it, and keeps a record anyone can check.</p>
          </div>
          <div className="modules reveal stagger">
            {MODULES.map((m, i) => (
              <article key={m.id} className="module">
                <span className={`icon-well ${m.tone ?? ""}`}>
                  <Icon name={m.icon} size={22} />
                </span>
                <span className="module-label">
                  <b>0{i + 1}</b> · Verfy {m.name}
                </span>
                <h3>{m.title}</h3>
                <div className="module-body">
                  <p>{m.body}</p>
                  <Link href={`/features#${m.id}`} className="module-link">
                    How {m.name} works <Icon name="arrowRight" size={15} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-rule band" id="how" aria-labelledby="how-title">
        <div className="shell">
          <div className="section-head split reveal">
            <span className="eyebrow">
              <span className="num">02</span> How it works
            </span>
            <h2 id="how-title">In the path of every tool call</h2>
            <p className="lead">Verfy decides on your machine, without waiting for the network. The web platform collects evidence; it is never in the way.</p>
          </div>
          <div className="glass flow reveal">
            <FlowDiagram />
            <FlowDiagramTall />
          </div>
          <div className="grid-2 reveal" style={{ marginTop: 48, alignItems: "center" }}>
            <div className="stack">
              <h3 style={{ fontSize: "1.3rem" }}>Every other call is checked too</h3>
              <p className="text-2">
                Guard runs the same deterministic rules on shell commands, file writes and web requests. Type a command to see what it would decide.
              </p>
            </div>
            <HeroDemo initialHashes={consoleHashes} />
          </div>
          <div className="grid-2 reveal" id="install" style={{ marginTop: 48, alignItems: "center" }}>
            <div className="stack">
              <h3 style={{ fontSize: "1.3rem" }}>Running in two minutes</h3>
              <p className="text-2">
                Lock the servers in your repository&apos;s <code className="inline-code">.mcp.json</code>, commit <code className="inline-code">verfy.lock</code>, and
                let CI fail any pull request in which a tool changed. <Link href="/docs#ci">Set up the GitHub Action</Link>.
              </p>
            </div>
            <CodeBlock
              label="Install commands"
              code={["$ pip install verfy            # no Python? the docs have a one-line installer", "$ verfy lock check --update   # review and lock today's tools", "$ git add verfy.lock && git commit -m \"Lock MCP tools\"", "$ verfy lock check            # in CI: exit 2 if a tool changed"].join("\n")}
            />
          </div>
        </div>
      </section>

      <section className="section section-rule" id="evidence" aria-labelledby="proof-title">
        <div className="shell">
          <div className="section-head split reveal">
            <span className="eyebrow">
              <span className="num">03</span> Evidence
            </span>
            <h2 id="proof-title">Records that prove themselves</h2>
            <p className="lead">
              Every receipt is linked to the one before it, so changing a record after the fact breaks the check exactly where it was changed. Once
              receipts reach Verfy Team, the server keeps their hashes and refuses a rewritten history, even one signed with the device&apos;s own key.
            </p>
          </div>
          <div className="reveal" style={{ maxWidth: 760 }}>
            <TamperDemo rows={chainRows} initialStates={chainStates} />
          </div>
        </div>
      </section>

      <section className="section section-rule band" id="team" aria-labelledby="team-title">
        <div className="shell reveal">
          <TeamPreview />
        </div>
      </section>

      <section className="section section-rule" id="faq" aria-labelledby="faq-title">
        <div className="shell faq-layout">
          <div className="faq-intro reveal">
            <span className="eyebrow">
              <span className="num">05</span> Questions
            </span>
            <h2 id="faq-title">Straight answers</h2>
            <p>
              Verfy only claims what it can show. The <Link href="/security">security model</Link> lists every limit in detail.
            </p>
          </div>
          <div className="faq reveal">
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq-item">
                <summary>
                  {q}
                  <span className="faq-icon" aria-hidden="true" />
                </summary>
                <div className="faq-body">
                  <p>{a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight" id="start" aria-labelledby="cta-title">
        <div className="shell">
          <div className="cta-band reveal">
            <div>
              <span className="eyebrow">Start today</span>
              <h2 id="cta-title">Lock your agent&apos;s tools today.</h2>
              <p>Free to start. The CLI is MIT-licensed, and Verfy Team runs on your own Vercel and Supabase projects.</p>
            </div>
            <div className="cta-actions">
              <Link href="/auth/sign-up" className="btn btn-light btn-lg">
                <span>Create your team</span>
                <Icon name="arrowRight" size={17} className="arrow" />
              </Link>
              <Link href="/security" className="btn btn-outline-light btn-lg">
                <span>Security model</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
