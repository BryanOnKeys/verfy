import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What the Verfy web app stores about you, why, who processes it and how to have it deleted.",
};

const CONTACT = "anvarbekovjavohir277@gmail.com";

const STORED: [string, string][] = [
  ["Account", "Your email address and the sign-in data Supabase Auth keeps for it. If you sign in with Google or GitHub, Supabase also receives your name and profile picture from that provider. Passwords are handled by Supabase Auth; Verfy never sees or stores them."],
  ["Organizations", "The organizations you create or join, your role in them, and invitations sent by email address."],
  ["Devices", "For each enrolled device: its name, platform and public key. Device tokens are stored only as SHA-256 hashes."],
  ["Receipts", "The receipts your devices upload: which tool was called, by which agent, when, the verdict and the rules that fired. Arguments and results are stored as hashes unless a device is configured to include redacted arguments."],
  ["Audit log", "Who changed what in an organization and when (policies, locks, members, devices, exports)."],
  ["Waitlist", "If you join the Verfy Cloud waitlist: your email address, and the company, team size and agents you chose to give. It is used only to tell you when Verfy Cloud opens, never sold or shared, and removed when you ask."],
  ["Rate limiting", "A salted hash of your IP address, kept briefly in counters that slow down repeated sign-in attempts and abuse. The IP address itself is not stored."],
];

export default function PrivacyPage() {
  return (
    <div className="shell section stack-lg" style={{ maxWidth: 820 }}>
      <header className="section-head">
        <span className="eyebrow">Privacy</span>
        <h1>Privacy policy</h1>
        <p className="lead">What the Verfy web app stores about you, why, and how to have it removed. Last updated 15 October 2026.</p>
      </header>

      <section className="stack" aria-labelledby="stored-h">
        <h2 id="stored-h" style={{ fontSize: "1.35rem" }}>What we store</h2>
        <dl className="stack">
          {STORED.map(([term, body]) => (
            <div key={term}>
              <dt style={{ fontWeight: 600 }}>{term}</dt>
              <dd className="text-2" style={{ margin: 0 }}>{body}</dd>
            </div>
          ))}
        </dl>
        <p className="text-2">
          The Verfy CLI runs on your machine. It keeps its receipts and policy locally and sends nothing anywhere unless you enroll it in a team and run{" "}
          <code className="inline-code">verfy sync</code>.
        </p>
      </section>

      <section className="stack" aria-labelledby="use-h">
        <h2 id="use-h" style={{ fontSize: "1.35rem" }}>How we use it</h2>
        <p className="text-2">
          Only to run the service: to sign you in, to show your organization its own policies, devices and receipts, and to protect the service from abuse.
          We do not sell data, show ads or use analytics trackers. Cookies are limited to the sign-in session, your theme choice and the organization you
          last opened.
        </p>
      </section>

      <section className="stack" aria-labelledby="who-h">
        <h2 id="who-h" style={{ fontSize: "1.35rem" }}>Who processes it</h2>
        <p className="text-2">
          Supabase hosts the database, authentication and file storage. Vercel hosts the web app. If you choose to sign in with Google or GitHub, that
          provider confirms your identity. Each of them processes data under its own privacy terms.
        </p>
      </section>

      <section className="stack" aria-labelledby="rights-h">
        <h2 id="rights-h" style={{ fontSize: "1.35rem" }}>Access and deletion</h2>
        <p className="text-2">
          Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the address on your account to get a copy of your data or to have your account
          deleted. Receipts and audit entries are append-only records that belong to the organization they were made in; an organization owner can ask for
          the whole organization to be deleted.
        </p>
      </section>
    </div>
  );
}
