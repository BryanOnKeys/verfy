import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { CodeBlock } from "@/components/copy-button";
import { Icon, type IconName } from "@/components/icons";
import { HeroDemo } from "@/components/live-guard";
import { buildChain, consoleChain, judge, PRESET, verifyChain } from "@/components/demo-chains";
import { ReceiptAnatomy, TamperDemo } from "@/components/proof";
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

const RISKS: [string, string][] = [
  ["It runs commands on your machine", "One wrong step can delete a folder, force-push over a colleague's work or pipe a script from the internet into a shell."],
  ["Its tools can change overnight", "An MCP server can rewrite a tool's description after you trusted it, and hide instructions that only the model reads."],
  ["Afterwards, nobody can prove what happened", "Chat logs can be edited and are not evidence. When something goes wrong, you need a record in which any later edit shows."],
];

const MODULES: { id: string; icon: IconName; tone?: string; name: string; title: string; body: string; ticks: string[] }[] = [
  {
    id: "guard",
    icon: "shieldCheck",
    name: "Guard",
    title: "Checks every step before it runs",
    body: "Shell commands, file writes, web requests, SQL and payments are checked against your policy. Every answer is allow, ask or deny, with the rule and the reason.",
    ticks: ["Deterministic rules, no model in the loop", "Errors become ask or deny, never a silent allow"],
  },
  {
    id: "scan",
    icon: "scan",
    tone: "cyan",
    name: "Scan",
    title: "Finds risky MCP servers",
    body: "Reads Claude Code, Cursor and Claude Desktop settings and flags hidden instructions, unpinned packages, plain-HTTP servers and leaked keys.",
    ticks: ["Static by default, never starts a server", "Rule IDs, severities and fixes for every finding"],
  },
  {
    id: "lock",
    icon: "lock",
    tone: "violet",
    name: "Lock",
    title: "Tools can't change behind your back",
    body: "The first time a tool is used, Atls pins the SHA-256 of its exact definition. If it changes later, it is blocked until a person reviews the difference.",
    ticks: ["Readable diffs, invisible characters spelled out", "Team approvals shared to every device"],
  },
  {
    id: "receipts",
    icon: "receipt",
    tone: "green",
    name: "Receipts",
    title: "A record that proves itself",
    body: "Every decision becomes a receipt, signed on the device with Ed25519 and chained to the one before it with SHA-256.",
    ticks: ["Edits, deletions and reordering are detected", "Private keys never leave the device"],
  },
];

const PRINCIPLES: { icon: IconName; title: string; body: string }[] = [
  { icon: "gauge", title: "Deterministic", body: "Same input, same verdict, every time, from rules you can read, test and change." },
  { icon: "shield", title: "Fail-safe", body: "A broken policy, unreadable lock or internal error turns into ask or deny. Atls never fails open." },
  { icon: "key", title: "Your keys stay yours", body: "Devices sign with keys that never leave them. The server stores public keys only and checks every signature." },
  { icon: "info", title: "Honest limits", body: "Atls sees what passes through its hook or gateway. It is not a sandbox, and it says so." },
];

const FAQ: [string, string][] = [
  [
    "Does an AI decide what my agent may do?",
    "No. Every verdict comes from deterministic rules: the same input always gets the same answer, and you can read, test and change the rules. No language model is ever asked whether something is allowed.",
  ],
  [
    "What happens if Atls itself fails?",
    "It fails safe. A broken policy, an unreadable lock file or an internal error becomes \"ask\" (or \"deny\", if you choose). Atls never lets an action through because something went wrong.",
  ],
  [
    "Does my code leave my computer?",
    "No. Checks run locally and never wait for the network. If you join a team, only receipts are uploaded, and by default they hold hashes of the arguments, not the arguments. Private keys never leave the device.",
  ],
  [
    "Which agents does it work with?",
    "Claude Code through its PreToolUse hook, and any MCP client (Cursor, Claude Desktop and others) through the Atls gateway in front of an MCP server.",
  ],
  [
    "Is Atls a sandbox?",
    "No. Atls checks what passes through its hook or gateway. For untrusted code, use it together with OS-level isolation such as a container or a virtual machine.",
  ],
  [
    "Can someone with access to my machine rewrite the record?",
    "Not one record at a time: any edit, deletion or reordering makes the check fail at that spot. But whoever holds a device's private key could build a whole new chain from scratch and sign it, and that chain would check out on its own. That is why receipts sync to Atls Team: the server keeps the hash of every receipt it has received and refuses a different one in the same place. A ledger that never left the machine has no such outside copy.",
  ],
  [
    "What does it cost?",
    "The CLI is free, under the MIT license. Atls Team is free software too: it runs on your own Vercel and Supabase projects, so you pay only what they charge you.",
  ],
];

const FLOW_DESC =
  "A tool call from the coding agent goes to Atls, which checks the policy and the tool lock and writes a signed receipt. Allowed calls continue to the tool; denied calls stop at Atls, and the receipt is still written.";

const FLOW_ROWS = [
  ["1", "Policy", "allow · ask · deny"],
  ["2", "Lock", "tool digest matches"],
  ["3", "Receipt", "signed and chained"],
];

function FlowDiagram() {
  return (
    <svg className="flow-wide" viewBox="0 0 760 290" role="img" aria-labelledby="flow-t flow-d">
      <title id="flow-t">Where Atls sits</title>
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
        Atls
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
      <title id="flow-t2">Where Atls sits</title>
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
        Atls
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

export default async function HomePage() {
  // both demos are computed here first, so the page is correct before (or without) JavaScript
  const chainRows = await buildChain();
  const [chainStates, consoleHashes] = await Promise.all([
    verifyChain(chainRows, false),
    consoleChain(PRESET.map((e) => ({ tool: e.tool, verdict: judge(e).verdict }))),
  ]);
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="shell hero-grid">
          <div>
            <span className="chip" {...enter(0)}>
              <span className="chip-dot" aria-hidden="true" />
              Security for coding agents and MCP tools
            </span>
            <h1 id="hero-title">
              <Words text="Control what your AI agents do." />{" "}
              <em>
                <Words text="Prove what they did." from={6} />
              </em>
            </h1>
            <p className="hero-desc" {...enter(2)}>
              Atls sits between your coding agent and its tools. Safe steps go straight through, risky ones wait for your approval, dangerous ones are
              blocked, and every step leaves a signed receipt in which any later edit shows.
            </p>
            <div className="hero-actions" {...enter(3)}>
              <Link href="/auth/sign-up" className="btn btn-primary btn-lg">
                <span>Get started free</span>
                <Icon name="arrowRight" size={17} className="arrow" />
              </Link>
              <Link href="/docs" className="btn btn-lg">
                <Icon name="terminal" size={17} />
                <span>Install the CLI</span>
              </Link>
            </div>
            <ul className="hero-facts" {...enter(4)}>
              <li>
                <Icon name="check" size={15} /> No AI decides what is allowed
              </li>
              <li>
                <Icon name="check" size={15} /> Works offline
              </li>
              <li>
                <Icon name="check" size={15} /> MIT-licensed CLI
              </li>
            </ul>
          </div>
          <div {...enter(5)}>
            <HeroDemo initialHashes={consoleHashes} />
          </div>
        </div>
      </section>

      <section className="works" aria-label="Works with">
        <div className="shell">
          <span className="label">Works with</span>
          <ul>
            <li>Claude Code</li>
            <li>Cursor</li>
            <li>Claude Desktop</li>
            <li>Any MCP client</li>
          </ul>
        </div>
      </section>

      <section className="section shell" id="problem" aria-labelledby="risk-title">
        <div className="section-head split reveal">
          <span className="eyebrow">
            <span className="num">01</span> The problem
          </span>
          <h2 id="risk-title">Your agent can act. Can you see what it does?</h2>
          <p className="lead">Coding agents now run commands, edit files and call tools on real machines, with real credentials. Three things go wrong.</p>
        </div>
        <ol className="risks reveal stagger">
          {RISKS.map(([t, b], i) => (
            <li key={t}>
              <span className="n">0{i + 1}</span>
              <h3>{t}</h3>
              <p>{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section section-rule" id="product" aria-labelledby="product-title">
        <div className="shell">
          <div className="section-head split reveal">
            <span className="eyebrow">
              <span className="num">02</span> The product
            </span>
            <h2 id="product-title">Four controls. One record you can trust.</h2>
            <p className="lead">Each works on its own on a developer&apos;s laptop. Together they answer: what did the agent do, with which tool, and who allowed it?</p>
          </div>
          <div className="modules reveal stagger">
            {MODULES.map((m, i) => (
              <article key={m.id} className="module">
                <span className={`icon-well ${m.tone ?? ""}`}>
                  <Icon name={m.icon} size={22} />
                </span>
                <span className="module-label">
                  <b>0{i + 1}</b> · Atls {m.name}
                </span>
                <h3>{m.title}</h3>
                <div className="module-body">
                  <p>{m.body}</p>
                  <ul className="ticks">
                    {m.ticks.map((t) => (
                      <li key={t}>
                        <Icon name="check" size={14} />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
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
              <span className="num">03</span> How it works
            </span>
            <h2 id="how-title">In the path of every tool call</h2>
            <p className="lead">Atls decides on your machine, without waiting for the network. The web platform collects evidence; it is never in the way.</p>
          </div>
          <div className="glass flow reveal">
            <FlowDiagram />
            <FlowDiagramTall />
          </div>
          <ol className="steps" style={{ marginTop: 48 }}>
            <li className="step">
              <span className="step-num">STEP 1</span>
              <h3>Install</h3>
              <p>
                Install the CLI and run <code>atls init</code>. Then <code>atls hook install --write</code> connects it to Claude Code.
              </p>
            </li>
            <li className="step">
              <span className="step-num">STEP 2</span>
              <h3>Work as usual</h3>
              <p>Safe steps pass instantly. Risky ones ask you first. Dangerous ones are stopped, with the rule and the reason.</p>
            </li>
            <li className="step">
              <span className="step-num">STEP 3</span>
              <h3>Prove it</h3>
              <p>
                Every step leaves a signed receipt. <code>atls verify</code> checks the chain offline, or share it with your team.
              </p>
            </li>
          </ol>
          <div className="grid-2 reveal" id="install" style={{ marginTop: 48, alignItems: "center" }}>
            <div className="stack">
              <h3 style={{ fontSize: "1.3rem" }}>Running in two minutes</h3>
              <p className="text-2">
                The CLI is plain Python with no required dependencies, and it never touches the network from inside a check.{" "}
                <Link href="/docs">Read the quickstart</Link>.
              </p>
            </div>
            <CodeBlock
              label="Install commands"
              code={["# not on PyPI yet: install from a copy of the Atls repository", "$ pip install ./atls-cli", "$ atls init", "$ atls hook install --write", "$ atls check \"rm -rf ~\""].join("\n")}
            />
          </div>
        </div>
      </section>

      <section className="section section-rule" id="evidence" aria-labelledby="proof-title">
        <div className="shell">
          <div className="section-head split reveal">
            <span className="eyebrow">
              <span className="num">04</span> Evidence
            </span>
            <h2 id="proof-title">Records that prove themselves</h2>
            <p className="lead">
              Every receipt is linked to the one before it, so changing a record after the fact breaks the check exactly where it was changed. Once
              receipts reach Atls Team, the server keeps their hashes and refuses a rewritten history, even one signed with the device&apos;s own key.
            </p>
          </div>
          <div className="proof reveal">
            <TamperDemo rows={chainRows} initialStates={chainStates} />
            <ReceiptAnatomy />
          </div>
        </div>
      </section>

      <section className="section section-rule band" id="team" aria-labelledby="team-title">
        <div className="shell reveal">
          <TeamPreview />
        </div>
      </section>

      <section className="section section-rule" id="principles" aria-labelledby="principles-title">
        <div className="shell">
          <div className="section-head reveal">
            <span className="eyebrow">
              <span className="num">06</span> Principles
            </span>
            <h2 id="principles-title">Built to be checked, not trusted</h2>
          </div>
          <div className="principles reveal stagger">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="principle">
                <span className="icon-well">
                  <Icon name={p.icon} size={19} />
                </span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-rule" id="faq" aria-labelledby="faq-title">
        <div className="shell faq-layout">
          <div className="faq-intro reveal">
            <span className="eyebrow">
              <span className="num">07</span> Questions
            </span>
            <h2 id="faq-title">Straight answers</h2>
            <p>
              Atls only claims what it can show. The <Link href="/security">security model</Link> lists every limit in detail.
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
              <h2 id="cta-title">Rules you can read. Proof you can check.</h2>
              <p>Free to start. The CLI is MIT-licensed, and Atls Team runs on your own Vercel and Supabase projects.</p>
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
