import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInWithGitHub } from "@/app/auth/actions";
import { SignUpForm } from "@/components/auth-forms";
import { Icon } from "@/components/icons";
import { NotConfigured } from "@/components/states";
import { isConfigured, publicEnv } from "@/lib/env";
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
  const github = publicEnv().NEXT_PUBLIC_AUTH_GITHUB_ENABLED === "true";
  return (
    <div className="shell auth-wrap">
      <div className="auth-card glass card-lg stack" data-light>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: "1.7rem" }}>Create your Atls account</h1>
          <p className="text-2 small">
            Already have one? <Link href="/auth/sign-in" className="link">Sign in</Link>
          </p>
        </div>
        {github && (
          <>
            <form action={signInWithGitHub}>
              <input type="hidden" name="next" value="/dashboard" />
              <button type="submit" className="btn btn-secondary" style={{ width: "100%" }}>
                <Icon name="github" size={18} />
                <span>Continue with GitHub</span>
              </button>
            </form>
            <div className="divider">or</div>
          </>
        )}
        <SignUpForm />
        <p className="tiny muted">After you confirm your email you can create an organization or accept an invitation.</p>
      </div>
    </div>
  );
}
