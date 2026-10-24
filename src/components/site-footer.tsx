import Link from "next/link";
import { Logo } from "./logo";

const COLS: [string, [string, string][]][] = [
  ["Product", [["/features", "Features"], ["/how-it-works", "How it works"], ["/compare", "Compare"], ["/pricing", "Pricing"]]],
  ["Security", [["/security", "Security model"], ["/advisories", "Verfy Advisories"], ["/security#bypass", "Find a bypass"], ["/security#disclosure", "Report a vulnerability"]]],
  ["Developers", [["/docs", "Quickstart"], ["/docs#cli", "CLI reference"], ["/docs#api", "API"], ["/changelog", "Changelog"], ["https://github.com/anvarbekovjavohir277-dot/verfy", "Source on GitHub"], ["https://pypi.org/project/verfy/", "PyPI"]]],
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div className="footer-brand">
          <Link href="/" className="brand" aria-label="Verfy home">
            <Logo size={26} />
          </Link>
          <p>Readable rules for AI agents, tools that can&apos;t change without you knowing, and a signed receipt for every call that passes through Verfy.</p>
        </div>
        {COLS.map(([title, links]) => (
          <nav key={title} className="footer-col" aria-label={title}>
            <h3>{title}</h3>
            <ul>
              {links.map(([href, label]) => (
                <li key={href}>
                  {href.startsWith("https://") ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {label}
                    </a>
                  ) : (
                    <Link href={href}>{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="shell footer-bottom">
        <span>
          The Verfy CLI is{" "}
          <a href="https://github.com/anvarbekovjavohir277-dot/verfy" target="_blank" rel="noopener noreferrer">
            open source
          </a>{" "}
          under the MIT license. <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
        </span>
        <span>Verfy is not a sandbox. The security model lists what it does not cover.</span>
      </div>
    </footer>
  );
}
