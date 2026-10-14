import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth-forms";
import { NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  if (!isConfigured()) {
    return (
      <div className="shell auth-wrap">
        <div className="auth-card"><NotConfigured /></div>
      </div>
    );
  }
  const { user, mfaPending } = await getSessionUser();
  if (user && mfaPending) redirect("/auth/mfa?next=/auth/reset-password");
  return (
    <div className="shell auth-wrap">
      <div className="auth-card glass card-lg stack" data-light>
        <h1 style={{ fontSize: "1.6rem" }}>Choose a new password</h1>
        {user ? (
          <ResetPasswordForm />
        ) : (
          <p className="text-2">
            Your reset link has expired or was already used. <Link href="/auth/forgot-password" className="link">Request a new one</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
