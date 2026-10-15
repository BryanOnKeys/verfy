import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Pricing",
  description: "The Verfy CLI is free, under the MIT license. Verfy Team is free software you run on your own Vercel and Supabase projects.",
};

const PLANS = [
  {
    name: "Verfy CLI",
    price: "Free",
    note: "MIT license",
    body: "Everything that runs on a developer's machine.",
    items: ["Guard: Claude Code hook and MCP gateway", "Scan: configs and tool definitions", "Lock: verfy.lock with drift detection", "Signed, hash-chained receipts and verfy verify"],
    cta: { href: "/docs#install", label: "Install the CLI", primary: false },
  },
  {
    name: "Verfy Team (self-hosted)",
    price: "Free software",
    note: "You pay only your own Vercel and Supabase usage",
    body: "The web platform in this repository, deployed to your accounts.",
    items: ["Team policies with simulator and history", "Device enrollment and revocation", "Server-verified receipts and chain checks", "Lock approvals, audit log and evidence exports"],
    cta: { href: "/auth/sign-up", label: "Create your team", primary: true },
  },
];

export default function PricingPage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head center">
        <span className="eyebrow">Pricing</span>
        <h1>Free to run today</h1>
        <p className="lead">There is no paid plan yet and nothing to buy on this page. When a hosted plan exists, it will be listed here with its real terms.</p>
      </header>
      <div className="grid-2">
        {PLANS.map((p, i) => (
          <article key={p.name} className={`glass card-lg stack reveal d${i}`} data-light>
            <h2 style={{ fontSize: "1.3rem" }}>{p.name}</h2>
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
            <Link href={p.cta.href} className={`btn ${p.cta.primary ? "btn-primary" : "btn-secondary"}`} style={{ justifySelf: "start" }}>
              <span>{p.cta.label}</span>
              <Icon name="arrowRight" size={16} className="arrow" />
            </Link>
          </article>
        ))}
      </div>
      <div className="glass card stack reveal" data-light>
        <div className="row">
          <h2 style={{ fontSize: "1.1rem" }}>Hosted Verfy Team</h2>
          <span className="badge">Not available</span>
        </div>
        <p className="text-2 small">A managed version is not offered. Certification, insurance and guarantees are not part of Verfy.</p>
      </div>
    </div>
  );
}
