import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { CreateOrgForm } from "@/components/create-org";
import { Icon } from "@/components/icons";
import { MfaSettings } from "@/components/mfa-forms";
import { ProfileForm } from "@/components/profile-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { listMyOrgs, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, supabase } = await requireUser("/settings");
  const [{ data: profile }, orgs, { data: factors }] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle(),
    listMyOrgs(),
    supabase.auth.mfa.listFactors(),
  ]);
  const totp = factors?.totp.find((f) => f.status === "verified");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your account, appearance and organizations.</p>
        </div>
      </div>
      <div className="stack-lg">
        <section className="glass card-lg stack" aria-labelledby="profile-h" data-light>
          <h2 id="profile-h" style={{ fontSize: "1.1rem" }}>Profile</h2>
          <dl className="kv">
            <dt>Email</dt>
            <dd>{profile?.email ?? user.email}</dd>
          </dl>
          <ProfileForm displayName={(profile?.display_name as string | null) ?? ""} />
        </section>

        <section className="glass card-lg stack" aria-labelledby="security-h" data-light>
          <h2 id="security-h" style={{ fontSize: "1.1rem" }}>Sign-in</h2>
          <p className="text-2 small">To change your password, we email you a reset link so the change is confirmed from your inbox.</p>
          <div className="row">
            <Link href="/auth/forgot-password" className="btn btn-secondary btn-sm">
              <Icon name="key" size={14} />
              <span>Change password</span>
            </Link>
            <form action={signOut}>
              <button type="submit" className="btn btn-ghost btn-sm">
                <Icon name="logout" size={14} />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </section>

        <section className="glass card-lg stack" aria-labelledby="mfa-h" data-light>
          <h2 id="mfa-h" style={{ fontSize: "1.1rem" }}>Two-factor authentication</h2>
          <MfaSettings factor={totp ? { id: totp.id, name: totp.friendly_name || "Authenticator app", created: totp.created_at.slice(0, 10) } : null} />
        </section>

        <section className="glass card-lg stack" aria-labelledby="appearance-h" data-light>
          <h2 id="appearance-h" style={{ fontSize: "1.1rem" }}>Appearance</h2>
          <div className="row">
            <ThemeToggle />
            <span className="text-2 small">Switch between light and dark. Your choice is remembered on this browser.</span>
          </div>
        </section>

        <section className="glass card-lg stack" aria-labelledby="orgs-h" data-light>
          <h2 id="orgs-h" style={{ fontSize: "1.1rem" }}>Organizations</h2>
          {orgs.length > 0 ? (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
              {orgs.map((o) => (
                <li key={o.id} className="row-between">
                  <span>
                    <strong>{o.name}</strong> <span className="mono small muted">{o.slug}</span>
                  </span>
                  <span className="badge">{o.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-2 small">You are not in any organization yet.</p>
          )}
          <details>
            <summary className="btn btn-secondary btn-sm" style={{ display: "inline-flex", listStyle: "none" }}>
              <span>Create another organization</span>
            </summary>
            <div style={{ marginTop: 16 }}>
              <CreateOrgForm />
            </div>
          </details>
        </section>
      </div>
    </>
  );
}
