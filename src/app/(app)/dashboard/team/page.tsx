import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { InviteForm, RemoveMember, RevokeInvite, RoleSelect } from "@/components/team-tools";
import { can, isRole, type Role } from "@/core/permissions";
import { fromDbError } from "@/server/http";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Team" };

const ROLE_HELP: [Role, string][] = [
  ["owner", "Everything, including changing owners. An organization always keeps at least one owner."],
  ["admin", "Publish policies, approve locks, enroll and revoke devices, invite and manage members (not owners)."],
  ["member", "Read receipts, policies, locks and devices; run the policy simulator."],
  ["auditor", "Read everything including the audit log, and create evidence exports. Cannot change anything."],
];

export default async function TeamPage() {
  const { db, org, user } = await requirePageOrg("/dashboard/team");
  const manage = can(org.role, "members.manage");
  const [{ data: members, error }, invites] = await Promise.all([
    db.from("memberships").select("user_id, role, created_at, profiles:user_id(email, display_name)").eq("org_id", org.id).order("created_at"),
    can(org.role, "members.invite")
      ? db.from("invitations").select("id, email, role, created_at, expires_at, accepted_at, revoked_at").eq("org_id", org.id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  if (error) throw fromDbError(error);
  const open = (invites.data ?? []).filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at as string) > new Date());
  const owners = (members ?? []).filter((m) => m.role === "owner").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p>Members of {org.name} and what each role can do. Roles are enforced by the database, not only by this page.</p>
        </div>
      </div>

      {can(org.role, "members.invite") && (
        <section className="glass card-lg stack" style={{ marginBottom: 16 }} aria-labelledby="invite-h" data-light>
          <h2 id="invite-h" style={{ fontSize: "1.05rem" }}>Invite someone</h2>
          <InviteForm orgId={org.id} />
          {open.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small muted">Open invitations</span>
              {open.map((i) => (
                <div key={i.id as string} className="row-between small">
                  <span>
                    {i.email as string} <span className="badge">{i.role as string}</span> <span className="tiny muted">expires {fmtDate(i.expires_at as string)}</span>
                  </span>
                  <RevokeInvite orgId={org.id} id={i.id as string} email={i.email as string} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="glass" aria-labelledby="members-h" data-light>
        <h2 id="members-h" style={{ fontSize: "1.05rem", padding: "16px 16px 4px" }}>
          Members ({members?.length ?? 0})
        </h2>
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Organization members</caption>
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => {
                const p = m.profiles as unknown as { email: string; display_name: string | null } | null;
                const isSelf = m.user_id === user.id;
                const role = isRole(m.role) ? m.role : "member";
                const canTouch = manage && (org.role === "owner" || role !== "owner");
                return (
                  <tr key={m.user_id as string}>
                    <td>
                      <strong>{p?.display_name || p?.email || "unknown"}</strong>
                      {p?.display_name && <div className="tiny muted">{p.email}</div>}
                    </td>
                    <td>{canTouch ? <RoleSelect orgId={org.id} userId={m.user_id as string} role={role} actorRole={org.role} isSelf={isSelf} /> : <span className="badge">{role}</span>}</td>
                    <td className="small muted">{fmtDate(m.created_at as string)}</td>
                    <td>
                      {role === "owner" && owners <= 1 ? (
                        <span className="tiny muted">only owner</span>
                      ) : (
                        (canTouch || isSelf) && <RemoveMember orgId={org.id} userId={m.user_id as string} email={p?.email ?? "this member"} isSelf={isSelf} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass card stack" style={{ marginTop: 16 }} aria-labelledby="roles-h" data-light>
        <h2 id="roles-h" style={{ fontSize: "1.05rem" }}>Roles</h2>
        <dl className="kv">
          {ROLE_HELP.map(([r, t]) => (
            <div key={r} style={{ display: "contents" }}>
              <dt>
                <span className="badge">{r}</span>
              </dt>
              <dd className="text-2 small">{t}</dd>
            </div>
          ))}
        </dl>
        <div className="row small muted" style={{ gap: 6 }}>
          <Icon name="info" size={14} /> Atls does not send email. Invitations are links you share yourself.
        </div>
      </section>
    </>
  );
}
