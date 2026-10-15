import Link from "next/link";
import { Logo } from "./logo";

const COLS: [string, [string, string][]][] = [
  ["Product", [["/features", "Features"], ["/how-it-works", "How it works"], ["/pricing", "Pricing"]]],
  ["Security", [["/security", "Security model"], ["/advisories", "Verfy Advisories"], ["/security#disclosure", "Report a vulnerability"]]],
  ["Developers", [["/docs", "Quickstart"], ["/docs#cli", "CLI reference"], ["/docs#api", "API"]]],
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div className="footer-brand">
          <Link href="/" className="brand" aria-label="Verfy home">
            <Logo size={26} />
          </Link>
          <p>Readable rules for AI agents, tools that cannot change behind your back, and a signed record of every action.</p>
        </div>
        {COLS.map(([title, links]) => (
          <nav key={title} className="footer-col" aria-label={title}>
            <h3>{title}</h3>
            <ul>
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="shell footer-bottom">
        <span>
          The Verfy CLI is released under the MIT license. <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
        </span>
        <span>Verfy is not a sandbox. The security model lists what it does not cover.</span>
      </div>
    </footer>
  );
}
