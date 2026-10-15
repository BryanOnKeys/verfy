import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { Icon } from "@/components/icons";
import { OAuthButtons } from "@/components/oauth-buttons";
import { NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  invalid_link: "That link is invalid or has expired. Request a new one.",
  oauth_failed: "That sign-in option is not available. Use another one or your email.",
  google_disabled: "Google sign-in is not enabled on this deployment.",
  google_failed: "Google sign-in could not start. Try again or use email.",
  github_disabled: "GitHub sign-in is not enabled on this deployment.",
  github_failed: "GitHub sign-in could not start. Try again or use email.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (!isConfigured()) {
    return (
      <div className="shell auth-wrap">
        <div className="auth-card"><NotConfigured /></div>
      </div>
    );
  }
  if ((await getSessionUser()).user) redirect(next);
  return (
    <div className="shell auth-wrap">
      <div className="auth-card glass card-lg stack" data-light>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: "1.7rem" }}>Sign in to Verfy</h1>
          <p className="text-2 small">
            New here? <Link href="/auth/sign-up" className="link">Create an account</Link>
          </p>
        </div>
        {sp.error && ERRORS[sp.error] && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={16} />
            <span>{ERRORS[sp.error]}</span>
          </div>
        )}
        <OAuthButtons next={next} />
        <SignInForm next={next} />
      </div>
    </div>
  );
}
