import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { EmptyState, PermissionDenied } from "@/components/states";
import { can } from "@/core/permissions";
import { fromDbError } from "@/server/http";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;

const LABELS: Record<string, string> = {
  "org.create": "Created the organization",
  "member.invite": "Invited a member",
  "member.invite_revoke": "Revoked an invitation",
  "member.join": "Joined",
  "member.role": "Changed a role",
  "member.remove": "Removed a member",
  "member.leave": "Left",
  "device.enrollment_create": "Created an enrollment code",
  "device.enroll": "Enrolled a device",
  "device.revoke": "Revoked a device",
  "policy.publish": "Published a policy",
  "lock.propose": "Proposed a tool lock",
  "lock.approve": "Approved a tool lock",
  "lock.reject": "Rejected a tool lock",
  "export.request": "Requested an export",
  "export.ready": "Export ready",
  "export.failed": "Export failed",
};

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { db, org } = await requirePageOrg("/dashboard/audit-log");
  if (!can(org.role, "audit.read")) return <PermissionDenied what="read the audit log" />;
  const sp = await searchParams;
  const before = sp.before && /^\d{1,18}$/.test(sp.before) ? Number(sp.before) : null;
  let q = db
    .from("audit_log")
    .select("id, action, target, details, at, actor_user, actor_device, prev_hash, hash")
    .eq("org_id", org.id)
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (before) q = q.lt("id", before);
  const { data, error } = await q;
  if (error) throw fromDbError(error);
  const rows = (data ?? []).slice(0, PAGE);
  const more = (data ?? []).length > PAGE;
  const userIds = [...new Set(rows.map((r) => r.actor_user).filter(Boolean))] as string[];
  const deviceIds = [...new Set(rows.map((r) => r.actor_device).filter(Boolean))] as string[];
  const [profiles, devices] = await Promise.all([
    userIds.length ? db.from("profiles").select("id, email").in("id", userIds) : Promise.resolve({ data: [] as { id: string; email: string }[] }),
    deviceIds.length ? db.from("devices").select("id, name").in("id", deviceIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const who = new Map<string, string>([...(profiles.data ?? []).map((p) => [p.id, p.email] as [string, string]), ...(devices.data ?? []).map((d) => [d.id, `device ${d.name}`] as [string, string])]);
  // links between consecutive rows on this page (each row's prev_hash is the row before it in id order)
  const linkOk = rows.map((r, i) => (i + 1 < rows.length ? r.prev_hash === rows[i + 1]!.hash : true));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every change to policies, members, devices, locks and exports. Append-only and hash-chained: each entry carries the hash of the one before.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="history" title="No entries yet" body="Entries appear as soon as someone changes something in this organization." />
      ) : (
        <div className="glass" data-light>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Audit log, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Target</th>
                  <th scope="col">Chain</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id as number}>
                    <td className="small muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.at as string)}</td>
                    <td className="small">{who.get((r.actor_user ?? r.actor_device) as string) ?? (r.actor_user || r.actor_device ? "former member" : "system")}</td>
                    <td className="small">
                      {LABELS[r.action as string] ?? (r.action as string)}
                      <div className="tiny muted mono">{r.action as string}</div>
                    </td>
                    <td className="small mono" style={{ maxWidth: 260, overflowWrap: "anywhere" }}>{(r.target as string | null) ?? "—"}</td>
                    <td>
                      <span className={`badge ${linkOk[i] ? "badge-ok" : "badge-invalid"}`} title={`hash ${r.hash as string}`}>
                        <Icon name={linkOk[i] ? "link" : "alert"} size={12} />
                        {(r.hash as string).slice(7, 15)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pager" aria-label="Pages">
            <span className="small muted">Newest first · {rows.length} shown</span>
            <span className="row" style={{ gap: 6 }}>
              {before && (
                <Link href="/dashboard/audit-log" className="btn btn-secondary btn-sm">
                  <span>Newest</span>
                </Link>
              )}
              {more && (
                <Link href={`/dashboard/audit-log?before=${rows.at(-1)!.id as number}`} className="btn btn-secondary btn-sm">
                  <span>Older</span>
                </Link>
              )}
            </span>
          </nav>
        </div>
      )}
    </>
  );
}
