import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AcceptInvite } from "@/components/accept-invite";
import { NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Join a team", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  if (!isConfigured()) {
    return (
      <div className="shell auth-wrap">
        <div className="auth-card"><NotConfigured /></div>
      </div>
    );
  }
  const { user } = await getSessionUser();
  return (
    <div className="shell auth-wrap">
      <div className="auth-card glass card-lg stack" data-light>
        <h1 style={{ fontSize: "1.6rem" }}>Join a team on Atls</h1>
        {user ? (
          <>
            <p className="text-2">
              You are signed in as <strong>{user.email}</strong>. The invitation only works for the email address it was sent to.
            </p>
            <AcceptInvite token={token} />
          </>
        ) : (
          <>
            <p className="text-2">Sign in or create an account with the invited email address, then come back to this link.</p>
            <div className="row">
              <Link href={`/auth/sign-in?next=/invite/${token}`} className="btn btn-primary">
                <span>Sign in</span>
              </Link>
              <Link href="/auth/sign-up" className="btn btn-secondary">
                <span>Create an account</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
