import type { Metadata } from "next";
import Link from "next/link";
import { CreateOrgForm } from "@/components/create-org";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { listReceipts, orgStats } from "@/server/data";
import { fmtDate, isDemoOrg } from "@/server/page";
import { currentOrg, requireUser } from "@/server/session";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { supabase } = await requireUser("/dashboard");
  const org = await currentOrg();
  if (!org) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Welcome to Verfy</h1>
            <p>Create an organization to collect receipts, share a policy and approve tool changes. If a teammate invited you, open their invitation link instead.</p>
          </div>
        </div>
        <div className="glass card-lg" data-light>
          <CreateOrgForm />
        </div>
      </>
    );
  }
  const db = supabase as unknown as SupabaseClient;
  const [stats, recent] = await Promise.all([orgStats(db, org.id), listReceipts(db, org.id, { page: 1, page_size: 6 })]);
  const total7 = stats.receipts_7d || 0;
  const allowed7 = Math.max(0, total7 - stats.denied_7d - stats.asked_7d);
  const pct = (n: number) => (total7 ? `${((n / total7) * 100).toFixed(1)}%` : "0%");

  const checklist = [
    { done: stats.devices_active > 0, label: "Enroll a device", href: "/dashboard/devices" },
    { done: (stats.policy_version ?? 1) > 1, label: "Publish a team policy", href: "/dashboard/policies" },
    { done: stats.receipts_total > 0, label: "Sync the first receipts", href: "/docs#team" },
    { done: stats.members > 1, label: "Invite a teammate", href: "/dashboard/team" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{org.name}</h1>
          <p>Activity across every enrolled device. All numbers come from your organization&apos;s stored receipts.</p>
        </div>
        <Link href="/dashboard/receipts" className="btn btn-secondary">
          <span>All receipts</span>
          <Icon name="arrowRight" size={16} className="arrow" />
        </Link>
      </div>

      {isDemoOrg(org) && (
        <div className="demo-ribbon" style={{ marginBottom: 20 }}>
          <span className="badge badge-demo">DEMO</span>
          <span>This organization was created by the local seed. Its device and receipts are test data signed with a published test key.</span>
        </div>
      )}

      <section className="grid-4" aria-label="Key figures">
        {[
          ["Actions, 7 days", total7.toLocaleString("en-US"), "var(--text)"],
          ["Needed approval", stats.asked_7d.toLocaleString("en-US"), "var(--warning)"],
          ["Blocked", stats.denied_7d.toLocaleString("en-US"), "var(--danger)"],
          ["Active devices", stats.devices_active.toLocaleString("en-US"), "var(--text)"],
        ].map(([label, value, color]) => (
          <div key={label} className="glass card kpi" data-light>
            <span className="label">{label}</span>
            <span className="value" style={{ color }}>
              {value}
            </span>
          </div>
        ))}
      </section>

      <section className="glass card" style={{ marginTop: 16 }} aria-labelledby="mix-h" data-light>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 id="mix-h" style={{ fontSize: "1rem" }}>
            Verdicts, last 7 days
          </h2>
          <span className="small muted">
            {pct(allowed7)} allowed · {pct(stats.asked_7d)} asked · {pct(stats.denied_7d)} blocked
          </span>
        </div>
        <div className="bar-track" role="img" aria-label={`${allowed7} allowed, ${stats.asked_7d} needed approval, ${stats.denied_7d} blocked`}>
          {total7 > 0 && (
            <>
              <span className="bar-allow" style={{ width: pct(allowed7) }} />
              <span className="bar-ask" style={{ width: pct(stats.asked_7d) }} />
              <span className="bar-deny" style={{ width: pct(stats.denied_7d) }} />
            </>
          )}
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          {stats.receipts_total.toLocaleString("en-US")} receipts stored in total · policy v{stats.policy_version ?? 1} · {stats.members} member{stats.members === 1 ? "" : "s"}
        </p>
      </section>

      <div className="grid-2" style={{ marginTop: 16, alignItems: "start" }}>
        <section className="glass" aria-labelledby="recent-h" data-light>
          <div className="row-between" style={{ padding: "16px 16px 4px" }}>
            <h2 id="recent-h" style={{ fontSize: "1rem" }}>
              Recent receipts
            </h2>
          </div>
          {recent.rows.length === 0 ? (
            <div className="empty">
              <p>No receipts yet. Enroll a device and run <code className="inline-code">verfy sync</code>.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">Most recent receipts</caption>
                <thead>
                  <tr>
                    <th scope="col">Verdict</th>
                    <th scope="col">Tool</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className={`badge badge-${r.verdict}`}>{r.verdict}</span>
                      </td>
                      <td>
                        <Link className="row-link" href={`/dashboard/receipts/${r.id}`}>
                          {r.server}/{r.tool}
                        </Link>
                      </td>
                      <td className="small muted">{fmtDate(r.issued_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="stack">
          {stats.locks_pending > 0 && (
            <Link href="/dashboard/locks" className="glass card card-link row-between" data-light>
              <span className="row">
                <span className="badge badge-pending">{stats.locks_pending} pending</span>
                <span>Tool changes waiting for review</span>
              </span>
              <Icon name="arrowRight" size={16} />
            </Link>
          )}
          <section className="glass card stack" aria-labelledby="setup-h" data-light>
            <h2 id="setup-h" style={{ fontSize: "1rem" }}>
              Setup
            </h2>
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
              {checklist.map((c) => (
                <li key={c.label} className="row" style={{ gap: 10 }}>
                  <span className={`badge ${c.done ? "badge-ok" : ""}`} aria-label={c.done ? "done" : "to do"}>
                    <Icon name={c.done ? "check" : "clock"} size={12} />
                  </span>
                  <Link href={c.href} className={c.done ? "muted" : ""} style={c.done ? { textDecoration: "line-through" } : undefined}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {stats.receipts_total === 0 && stats.devices_active === 0 && (
            <EmptyState
              icon="device"
              title="Connect your first device"
              body="Create an enrollment code, then run verfy team enroll on the developer machine or CI runner."
              action={
                <Link href="/dashboard/devices" className="btn btn-primary btn-sm">
                  <span>Add a device</span>
                </Link>
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
