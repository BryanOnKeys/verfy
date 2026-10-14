import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Icon } from "@/components/icons";
import { SecondFactorForm } from "@/components/mfa-forms";
import { NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Two-factor authentication", robots: { index: false } };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (!isConfigured()) {
    return (
      <div className="shell auth-wrap">
        <div className="auth-card">
          <NotConfigured />
        </div>
      </div>
    );
  }
  const { user, mfaPending } = await getSessionUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  if (!mfaPending) redirect(next);
  return (
    <div className="shell auth-wrap">
      <div className="auth-card glass card-lg stack">
        <span className="icon-well">
          <Icon name="shieldCheck" size={20} />
        </span>
        <h1>Enter your code</h1>
        <p className="text-2 small">
          Two-factor authentication is on for <strong>{user.email}</strong>. Open your authenticator app and enter the current 6-digit code.
        </p>
        <SecondFactorForm next={next} />
        <form action={signOut}>
          <button type="submit" className="btn btn-ghost btn-sm">
            <Icon name="logout" size={14} />
            <span>Use a different account</span>
          </button>
        </form>
      </div>
    </div>
  );
}
