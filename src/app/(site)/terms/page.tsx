import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using the Verfy web app during its early-access period.",
};

const CONTACT = "anvarbekovjavohir277@gmail.com";

export default function TermsPage() {
  return (
    <div className="shell section stack-lg" style={{ maxWidth: 820 }}>
      <header className="section-head">
        <span className="eyebrow">Terms</span>
        <h1>Terms of service</h1>
        <p className="lead">The terms for using the Verfy web app while it is in early access. Last updated 15 October 2026.</p>
      </header>

      <section className="stack text-2">
        <p>
          <strong>Early access.</strong> Verfy is an early product. Features can change, and the service can be unavailable. Keep your own copy of anything
          you cannot afford to lose; the CLI keeps receipts on your machine for this reason.
        </p>
        <p>
          <strong>No guarantee of security.</strong> Verfy reduces risk from coding agents and records what they did. It is not a sandbox and cannot stop
          every harmful action. <Link href="/security">The security model</Link> lists what it does not cover. The service is provided as is, without
          warranties, to the extent the law allows.
        </p>
        <p>
          <strong>Your account.</strong> Keep your sign-in and device tokens to yourself, and only enroll devices and invite people you trust. You are
          responsible for what is done through your organization.
        </p>
        <p>
          <strong>Acceptable use.</strong> Do not use Verfy to attack other systems, to store data you have no right to store, or to overload the service.
          We may suspend accounts that do.
        </p>
        <p>
          <strong>Your data.</strong> Your organization&apos;s data stays yours. How it is stored and deleted is described in the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
        <p>
          <strong>Changes and contact.</strong> We will update this page when the terms change. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </section>
    </div>
  );
}
