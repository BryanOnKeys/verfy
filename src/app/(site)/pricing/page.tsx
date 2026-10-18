import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Pricing",
  description: "The Verfy CLI and GitHub Action are free under the MIT license. A hosted Verfy Team plan is planned at $19 per seat per month and is not on sale yet.",
};

const CONTACT = "anvarbekovjavohir277@gmail.com";

const PLANS = [
  {
    name: "Verfy CLI",
    price: "Free",
    note: "MIT license",
    status: null,
    body: "Everything that runs on a developer's machine and in CI.",
    items: [
      "Lock: verfy.lock with drift detection",
      "GitHub Action that fails a pull request when a tool changed",
      "Guard: Claude Code hook and MCP gateway",
      "Signed, chained receipts, verfy verify and SCITT export",
      "Scan: configs and tool definitions",
    ],
    cta: { href: "/docs#install", label: "Install the CLI", primary: true },
  },
  {
    name: "Verfy Team",
    price: "$19",
    note: "per seat per month, planned",
    status: "Not on sale yet",
    body: "Hosted by Verfy, for teams that need one policy and evidence an auditor can use.",
    items: [
      "One team policy and team-approved locks on every device",
      "Receipt archive, checked again on the server",
      "Evidence exports for SOC 2 and EU AI Act reviews",
      "Roles, device enrollment and an audit log",
    ],
    cta: { href: `mailto:${CONTACT}?subject=${encodeURIComponent("Verfy Team early access")}`, label: "Ask for early access", primary: false },
  },
  {
    name: "Self-hosted Team",
    price: "Free software",
    note: "You pay only your own Vercel and Supabase usage",
    status: null,
    body: "The same web platform, deployed to your own accounts.",
    items: ["Team policies with simulator and history", "Device enrollment and revocation", "Server-verified receipts and chain checks", "Lock approvals, audit log and evidence exports"],
    cta: { href: "/auth/sign-up", label: "Create your team", primary: false },
  },
];

export default function PricingPage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head center">
        <span className="eyebrow">Pricing</span>
        <h1>The tool is free. Teams pay for evidence.</h1>
        <p className="lead">
          Nothing on this page can be bought yet. When hosted Verfy Team opens, its price and terms will be listed here before anyone is charged.
        </p>
      </header>
      <div className="grid-3">
        {PLANS.map((p, i) => (
          <article key={p.name} className={`glass card-lg stack reveal d${i}`} data-light>
            <div className="row">
              <h2 style={{ fontSize: "1.3rem" }}>{p.name}</h2>
              {p.status && <span className="badge badge-pending">{p.status}</span>}
            </div>
            <div>
              <div style={{ fontSize: "2.2rem", fontWeight: 700, letterSpacing: "-0.03em" }}>{p.price}</div>
              <div className="small muted">{p.note}</div>
            </div>
            <p className="text-2">{p.body}</p>
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {p.items.map((it) => (
                <li key={it} className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                  <Icon name="check" size={16} style={{ color: "var(--success)", marginTop: 4, flex: "0 0 auto" }} />
                  <span className="text-2">{it}</span>
                </li>
              ))}
            </ul>
            {p.cta.href.startsWith("mailto:") ? (
              <a href={p.cta.href} className="btn btn-secondary" style={{ justifySelf: "start" }}>
                <span>{p.cta.label}</span>
                <Icon name="arrowRight" size={16} className="arrow" />
              </a>
            ) : (
              <Link href={p.cta.href} className={`btn ${p.cta.primary ? "btn-primary" : "btn-secondary"}`} style={{ justifySelf: "start" }}>
                <span>{p.cta.label}</span>
                <Icon name="arrowRight" size={16} className="arrow" />
              </Link>
            )}
          </article>
        ))}
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
