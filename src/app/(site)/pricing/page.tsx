import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { WaitlistForm } from "@/components/waitlist-form";

export const metadata: Metadata = {
  title: "Pricing",
  description: "The Verfy CLI, the GitHub Action and a self-hosted Verfy Team are free. Verfy Cloud, a hosted Team plan planned at $19 per seat per month, is not on sale yet; join the waitlist.",
};

const FREE = [
  "Lock: verfy.lock with drift detection, and a GitHub Action that fails a pull request when a tool changed",
  "Guard: Claude Code hook and MCP gateway, deterministic rules, self-protection",
  "Signed, chained receipts, verfy verify and SCITT export",
  "Scan: MCP configs and tool definitions",
  "Verfy Team on your own Vercel and Supabase: team policy, device enrollment, receipt archive, audit log, evidence exports",
];

const CLOUD = [
  "Verfy Team without servers to run: we host, update and back it up",
  "One team policy and team-approved locks on every device",
  "Receipt archive, checked again on the server",
  "Evidence exports for SOC 2 and EU AI Act reviews",
];

function Items({ items }: { items: string[] }) {
  return (
    <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((it) => (
        <li key={it} className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
          <Icon name="check" size={16} style={{ color: "var(--success)", marginTop: 4, flex: "0 0 auto" }} />
          <span className="text-2">{it}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head center">
        <span className="eyebrow">Pricing</span>
        <h1>Free to use today. A hosted plan is coming.</h1>
        <p className="lead">
          Everything that works today is free. Verfy Cloud is not on sale yet: join the waitlist, and we will write when it opens, with its price and terms,
          before anyone is charged.
        </p>
      </header>
      <div className="grid-2">
        <article className="glass card-lg stack reveal d0" data-light>
          <h2 style={{ fontSize: "1.3rem" }}>Free</h2>
          <div>
            <div style={{ fontSize: "2.2rem", fontWeight: 700, letterSpacing: "-0.03em" }}>$0</div>
            <div className="small muted">MIT license. If you self-host Team, you pay only your own Vercel and Supabase usage.</div>
          </div>
          <p className="text-2">The CLI, the GitHub Action and the Team web platform, on your machines and your own accounts.</p>
          <Items items={FREE} />
          <div className="row" style={{ gap: 10 }}>
            <Link href="/docs#install" className="btn btn-primary">
              <span>Install the CLI</span>
              <Icon name="arrowRight" size={16} className="arrow" />
            </Link>
            <a href="https://github.com/anvarbekovjavohir277-dot/verfy/tree/main/deploy" className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
              <span>Self-host Team</span>
            </a>
          </div>
          <p className="small muted">
            During the beta you can also <Link href="/auth/sign-up">try Verfy Team on this site</Link> for free.
          </p>
        </article>
        <article className="glass card-lg stack reveal d1" data-light>
          <div className="row">
            <h2 style={{ fontSize: "1.3rem" }}>Verfy Cloud</h2>
            <span className="badge badge-pending">Coming later</span>
          </div>
          <div>
            <div style={{ fontSize: "2.2rem", fontWeight: 700, letterSpacing: "-0.03em" }}>$19</div>
            <div className="small muted">per seat per month, planned</div>
          </div>
          <p className="text-2">Verfy Team, hosted by Verfy, for teams that need one policy and evidence an auditor can use.</p>
          <Items items={CLOUD} />
          <WaitlistForm />
        </article>
      </div>
      <div className="glass card stack reveal" data-light>
        <h2 style={{ fontSize: "1.1rem" }}>What Verfy does not sell</h2>
        <p className="text-2 small">
          Certification, insurance and guarantees are not part of Verfy. An evidence export helps an auditor see what your agents did; it does not make
          you compliant on its own.
        </p>
      </div>
    </div>
  );
}
