import type { Metadata } from "next";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Security",
  description: "The Verfy security model: what is trusted, what receipts prove and do not prove, how tenant data is isolated, and how to report a vulnerability.",
};

const CONTROLS: [string, string][] = [
  ["Tenant isolation", "Row-level security on every table, keyed to the signed-in user's memberships. Server routes check the organization again. Cross-tenant access is covered by automated tests on real Postgres."],
  ["No direct writes", "Browsers can only read. Every change goes through a database function that checks the caller's role and writes an audit entry in the same transaction."],
  ["Append-only evidence", "Receipts, published policy versions and the audit log cannot be updated or deleted, not even with the server's secret key."],
  ["Device keys", "Receipts are signed on the device with Ed25519. The server stores only public keys and re-verifies every signature and hash link on upload."],
  ["Secrets", "The secret Supabase key is used only in server code after Verfy has authenticated the caller. Device tokens and invitation tokens are stored as SHA-256 hashes."],
  ["Web hardening", "Per-request CSP nonces, HSTS, frame blocking, strict referrer policy, origin checks on every cookie-authenticated change, schema validation with size limits, and safe error messages."],
  ["Rate limits", "Shared Postgres counters across serverless instances for sign-in, enrollment, ingest, exports and public endpoints. If the limiter fails, requests are refused, not let through."],
  ["Supply chain", "Pinned dependencies with a lockfile, dependency audit and secret scanning in CI, and a CLI with no required third-party packages."],
];

export default function SecurityPage() {
  return (
    <div className="shell section stack-lg">
      <header className="section-head">
        <span className="eyebrow">Security</span>
        <h1>The security model, plainly</h1>
        <p className="lead">
          No product is unbreakable, and Verfy does not claim to be. This page says what Verfy protects, how, and where its protection ends. The full threat
          model is in <code className="inline-code">docs/THREAT_MODEL.md</code> in the repository.
        </p>
      </header>

      <section className="grid-2" aria-label="What receipts prove">
        <div className="glass card-lg stack reveal" data-light>
          <h2 style={{ fontSize: "1.35rem" }}>
            <span className="badge badge-allow" style={{ marginRight: 8 }}>proves</span> A receipt shows
          </h2>
          <ul className="stack text-2" style={{ paddingLeft: 18, margin: 0 }}>
            <li>which tool call passed through Verfy, when, and in which session;</li>
            <li>the verdict, the rules that fired and the hash of the policy that decided it;</li>
            <li>the digest of the tool definition in use, and the hash of the arguments and result;</li>
            <li>that the device holding the key signed it, and that no receipt in the chain was changed, removed or reordered since.</li>
          </ul>
        </div>
        <div className="glass card-lg stack reveal d1" data-light>
          <h2 style={{ fontSize: "1.35rem" }}>
            <span className="badge badge-deny" style={{ marginRight: 8 }}>does not prove</span> A receipt cannot show
          </h2>
          <ul className="stack text-2" style={{ paddingLeft: 18, margin: 0 }}>
            <li>what a tool or MCP server did internally after it was called;</li>
            <li>actions that never went through the Verfy hook or gateway;</li>
            <li>that the device itself was not compromised when it signed;</li>
            <li>
              that a whole ledger was not deleted and restarted, or rebuilt and re-signed by someone holding the device key (only an outside copy, such as
              the receipts already synced to Verfy Team, shows that).
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="controls-h" className="stack">
        <h2 id="controls-h">Controls in place</h2>
        <div className="grid-2">
          {CONTROLS.map(([t, b], i) => (
            <div key={t} className={`glass card stack reveal d${i % 2}`} data-light>
              <h3 className="row" style={{ gap: 8 }}>
                <Icon name="check" size={16} className="muted" /> {t}
              </h3>
              <p className="text-2 small">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="limits-h" className="glass card-lg stack reveal" data-light>
        <h2 id="limits-h" style={{ fontSize: "1.35rem" }}>Known limits</h2>
        <ul className="stack text-2" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Guard rules are pattern matching. A determined attacker can phrase a command Verfy does not recognise; unknown risky patterns are not assumed safe, but Verfy is not a sandbox.</li>
          <li>The scanner finds known warning signs. A clean scan does not mean a tool is safe.</li>
          <li>DDoS protection depends on your hosting plan and settings. Verfy adds application rate limits; it does not replace a firewall.</li>
          <li>No independent penetration test has been performed yet. Treat this release as an MVP and review it before relying on it.</li>
        </ul>
      </section>

      <section id="disclosure" aria-labelledby="disclosure-h" className="glass card-lg stack reveal" data-light>
        <h2 id="disclosure-h" style={{ fontSize: "1.35rem" }}>Report a vulnerability</h2>
        <p className="text-2">
          Please report security issues privately, not in public issues. Use GitHub&apos;s private vulnerability reporting on the Verfy repository (Security
          tab, &quot;Report a vulnerability&quot;), or the contact in <code className="inline-code">SECURITY.md</code>. Include steps to reproduce and the
          version you tested. We will acknowledge your report and keep you informed while we fix it.
        </p>
        <p className="small muted">Please do not test against other people&apos;s deployments, access data that is not yours, or degrade service for others.</p>
      </section>
    </div>
  );
}
