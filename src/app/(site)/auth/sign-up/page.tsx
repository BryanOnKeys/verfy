import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth-forms";
import { OAuthButtons } from "@/components/oauth-buttons";
import { NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function SignUpPage() {
  if (!isConfigured()) {
    return (
      <div className="shell auth-wrap">
        <div className="auth-card"><NotConfigured /></div>
      </div>
    );
  }
  if ((await getSessionUser()).user) redirect("/dashboard");
  return (
    <div className="shell auth-wrap">
      <div className="auth-card glass card-lg stack" data-light>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: "1.7rem" }}>Create your Atls account</h1>
          <p className="text-2 small">
            Already have one? <Link href="/auth/sign-in" className="link">Sign in</Link>
          </p>
        </div>
        <OAuthButtons next="/dashboard" />
        <SignUpForm />
        <p className="tiny muted">After you confirm your email you can create an organization or accept an invitation.</p>
      </div>
    </div>
  );
}
