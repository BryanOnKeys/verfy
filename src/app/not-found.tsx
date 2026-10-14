import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="shell auth-wrap">
      <div className="glass card-lg stack" style={{ maxWidth: 480, textAlign: "center", justifyItems: "center" }}>
        <span className="eyebrow">404</span>
        <h1 style={{ fontSize: "1.8rem" }}>This page does not exist</h1>
        <p className="text-2">Check the address, or go back to somewhere useful.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href="/" className="btn btn-primary">
            <span>Home</span>
          </Link>
          <Link href="/docs" className="btn btn-secondary">
            <span>Docs</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
