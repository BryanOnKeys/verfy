import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { ReceiptAnatomy } from "@/components/proof";

export const metadata: Metadata = {
  title: "How it works",
  description: "Where Atls sits between a coding agent and its tools, how receipts are chained and signed, and how team sync stays out of the critical path.",
};

function FlowDiagram() {
  return (
    <svg className="diagram" viewBox="0 0 860 300" role="img" aria-labelledby="flow-title flow-desc" style={{ width: "100%", height: "auto" }}>
      <title id="flow-title">Atls in the tool-call path</title>
      <desc id="flow-desc">
        The agent sends a tool call to the Atls hook or gateway. Atls checks policy and the lock, writes a signed receipt to the local ledger, and only then
        lets the call reach the tool. Denied calls stop at Atls. A separate sync process uploads receipts to Atls Team.
      </desc>
      <rect className="box" x="20" y="96" width="170" height="86" rx="14" />
      <text x="105" y="134" textAnchor="middle" fontWeight="600">Coding agent</text>
      <text className="sub" x="105" y="156" textAnchor="middle">Claude Code, Cursor, MCP client</text>

      <rect className="box-accent" x="300" y="70" width="240" height="138" rx="16" />
      <text x="420" y="104" textAnchor="middle" fontWeight="700">Atls</text>
      <text className="sub" x="420" y="128" textAnchor="middle">1. policy check (allow · ask · deny)</text>
      <text className="sub" x="420" y="148" textAnchor="middle">2. atls.lock digest check</text>
      <text className="sub" x="420" y="168" textAnchor="middle">3. signed receipt → local ledger</text>

      <rect className="box" x="660" y="96" width="180" height="86" rx="14" />
      <text x="750" y="134" textAnchor="middle" fontWeight="600">Tool / MCP server</text>
      <text className="sub" x="750" y="156" textAnchor="middle">runs only if allowed</text>

      <path className="wire-accent flow" d="M190 139 H300" />
      <path className="wire-accent flow" d="M540 139 H660" />
      <circle className="deny" cx="600" cy="225" r="5" />
      <path className="wire" d="M480 208 Q520 225 595 225" />
      <text className="sub" x="612" y="229">denied: stops here, receipt still written</text>

      <rect className="box" x="300" y="246" width="240" height="44" rx="12" />
      <text x="420" y="273" textAnchor="middle" className="sub">atls sync (separate process) → Atls Team</text>
      <path className="wire" d="M420 208 V246" strokeDasharray="4 4" />
    </svg>
  );
}

function ChainDiagram() {
  const blocks = [0, 1, 2, 3];
  return (
    <svg className="diagram" viewBox="0 0 860 170" role="img" aria-labelledby="chain-title chain-desc" style={{ width: "100%", height: "auto" }}>
      <title id="chain-title">Receipt hash chain</title>
      <desc id="chain-desc">Each receipt stores the SHA-256 of the whole previous receipt in its prev field and is signed with the device key, so changing, removing or reordering any receipt breaks every link after it.</desc>
      {blocks.map((i) => {
        const x = 20 + i * 210;
        return (
          <g key={i}>
            <rect className={i === 2 ? "box-accent" : "box"} x={x} y="30" width="180" height="110" rx="14" />
            <text x={x + 16} y="58" fontWeight="600">receipt #{i}</text>
            <text className="sub" x={x + 16} y="80">prev = {i === 0 ? "null" : `sha256(#${i - 1})`}</text>
            <text className="sub" x={x + 16} y="100">verdict, rules, tool digest</text>
            <text className="sub" x={x + 16} y="120">sig = Ed25519(device key)</text>
            {i < blocks.length - 1 && <path className="wire-accent" d={`M${x + 180} 85 H${x + 210}`} />}
          </g>
        );
      })}
    </svg>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head">
        <span className="eyebrow">How it works</span>
        <h1>Atls sits in the path of every tool call</h1>
        <p className="lead">
          It runs on the developer&apos;s machine, decides locally and quickly, and never waits on the network. The web platform collects evidence; it is
          never in the critical path.
        </p>
      </header>

      <section className="glass card-lg stack reveal" aria-labelledby="path-h" data-light>
        <h2 id="path-h" style={{ fontSize: "1.5rem" }}>The tool-call path</h2>
        <FlowDiagram />
        <div className="grid-3">
          <div className="stack">
            <h3>Claude Code hook</h3>
            <p className="text-2 small">
              <code className="inline-code">atls hook pre-tool-use</code> receives each call as JSON. Atls answers deny or ask with the rule and reason,
              or stays silent so Claude Code&apos;s own permissions decide. It never answers allow on its own.
            </p>
          </div>
          <div className="stack">
            <h3>MCP gateway</h3>
            <p className="text-2 small">
              <code className="inline-code">atls proxy</code> wraps a stdio MCP server: it scans tools/list, hides poisoned or drifted tools, checks
              every tools/call and can ask the user through MCP elicitation.
            </p>
          </div>
          <div className="stack">
            <h3>Failure modes</h3>
            <p className="text-2 small">
              Bad input, a broken policy, an unreadable lock or a full disk all become <strong>ask</strong> (or <strong>deny</strong> with{" "}
              <code className="inline-code">fail_mode</code>). Atls never fails open.
            </p>
          </div>
        </div>
      </section>

      <section className="glass card-lg stack reveal" aria-labelledby="chain-h" data-light>
        <h2 id="chain-h" style={{ fontSize: "1.5rem" }}>Receipts and the hash chain</h2>
        <ChainDiagram />
        <p className="text-2">
          The signature covers the canonical JSON of every field (sorted keys, no whitespace, JavaScript number formatting), so the Python CLI and the
          TypeScript server produce byte-identical input. The repository ships shared test vectors that both implementations must verify.
        </p>
      </section>

      <section className="grid-2">
        <div className="glass card-lg stack reveal" data-light>
          <h2 style={{ fontSize: "1.35rem" }}>Team sync</h2>
          <div className="timeline">
            <div><span>An admin creates a one-time enrollment code (valid one hour).</span></div>
            <div><span><code className="inline-code">atls team enroll</code> sends the device&apos;s public key; the server returns a device token stored only as a hash.</span></div>
            <div><span><code className="inline-code">atls sync</code> uploads receipts in batches of up to 500. The server checks schema, signature, sequence and links, and stores them idempotently.</span></div>
            <div><span><code className="inline-code">atls team pull</code> fetches the team policy and team-approved locks.</span></div>
          </div>
        </div>
        <div className="glass card-lg stack reveal d1" data-light>
          <h2 style={{ fontSize: "1.35rem" }}>Lock drift</h2>
          <div className="timeline">
            <div><span>First use: Atls locks the digest of every tool the server lists.</span></div>
            <div><span>Later, a description changes (for example, a hidden instruction is added).</span></div>
            <div><span>The tool is hidden and its calls are denied with ATL-TOOL-004.</span></div>
            <div><span>A person reviews <code className="inline-code">atls lock diff</code>, then approves locally or proposes the change to the team.</span></div>
          </div>
        </div>
      </section>

      <section className="stack reveal" style={{ marginBottom: 32 }} aria-labelledby="anatomy-title">
        <h2 id="anatomy-title" style={{ fontSize: "1.5rem" }}>Inside a receipt</h2>
        <p className="text-2">One record from the published test vectors. Point at a part to see what it proves.</p>
        <ReceiptAnatomy />
      </section>

      <div className="alert alert-info">
        <Icon name="info" size={16} />
        <span>
          Atls only sees calls that pass through its hook or gateway. Tools an agent can reach another way, or what a server does internally, are outside
          what Atls can check or prove.
        </span>
      </div>
    </div>
  );
}
