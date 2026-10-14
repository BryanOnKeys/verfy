import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="shell auth-wrap">
      <div className="auth-card glass card-lg stack" data-light>
        <h1 style={{ fontSize: "1.6rem" }}>Reset your password</h1>
        <p className="text-2 small">We send a reset link to your email. It expires in one hour.</p>
        {isConfigured() ? <ForgotPasswordForm /> : <NotConfigured />}
        <Link href="/auth/sign-in" className="small link">Back to sign in</Link>
      </div>
    </div>
  );
}
