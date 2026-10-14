import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInWithGitHub } from "@/app/auth/actions";
import { SignInForm } from "@/components/auth-forms";
import { Icon } from "@/components/icons";
import { NotConfigured } from "@/components/states";
import { isConfigured, publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  invalid_link: "That link is invalid or has expired. Request a new one.",
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
  const github = publicEnv().NEXT_PUBLIC_AUTH_GITHUB_ENABLED === "true";
  return (
    <div className="shell auth-wrap">
      <div className="auth-card glass card-lg stack" data-light>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: "1.7rem" }}>Sign in to Atls</h1>
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
        {github && (
          <>
            <form action={signInWithGitHub}>
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="btn btn-secondary" style={{ width: "100%" }}>
                <Icon name="github" size={18} />
                <span>Continue with GitHub</span>
              </button>
            </form>
            <div className="divider">or</div>
          </>
        )}
        <SignInForm next={next} />
      </div>
    </div>
  );
}
