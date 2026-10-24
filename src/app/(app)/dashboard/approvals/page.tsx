import type { Metadata } from "next";
import { ApprovalDecision } from "@/components/decision-buttons";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { can } from "@/core/permissions";
import { listApprovals } from "@/server/data";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Approvals" };

interface ApprovalRow {
  id: string;
  server_id: string;
  tool_name: string;
  kind: string;
  args_sha256: string;
  findings: { rule: string; verdict: string; message: string }[];
  status: "pending" | "approved" | "rejected" | "expired";
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decision_note: string | null;
  devices: { name: string } | null;
}

export default async function ApprovalsPage() {
  const { db, org } = await requirePageOrg("/dashboard/approvals");
  const rows = (await listApprovals(db, org.id)) as unknown as ApprovalRow[];
  const canDecide = can(org.role, "approvals.decide");
  const status = (r: ApprovalRow) => r.status;
  const waiting = rows.filter((r) => status(r) === "pending");
  const done = rows.filter((r) => status(r) !== "pending");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p>
            Calls that need a person, sent by devices whose gateway runs with <code className="inline-code">&quot;on_ask&quot;: &quot;team&quot;</code>. The
            device waits for your answer; a request nobody decides in time is refused.
          </p>
        </div>
      </div>

      <section aria-labelledby="waiting-h" className="stack" style={{ marginBottom: 32 }}>
        <h2 id="waiting-h" style={{ fontSize: "1.15rem" }}>
          Waiting <span className="badge badge-pending">{waiting.length}</span>
        </h2>
        {waiting.length === 0 && (
          <EmptyState icon="shieldCheck" title="Nothing is waiting" body="When an agent behind the gateway makes a call that needs approval, it shows up here. Reload to see new requests." />
        )}
        {waiting.map((r) => (
          <article key={r.id} className="glass card-lg stack" aria-labelledby={`appr-${r.id}`} data-light>
            <div className="row-between">
              <h3 id={`appr-${r.id}`} className="mono">
                {r.server_id}/{r.tool_name}
              </h3>
              <span className="small muted">
                {fmtDate(r.created_at)}
                {r.devices ? ` from ${r.devices.name}` : ""} · answer by {fmtDate(r.expires_at)}
              </span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {r.findings.map((f, i) => (
                <div key={i} className="row small" style={{ gap: 8, alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <span className={`badge badge-${f.verdict}`}>{f.verdict}</span>
                  <span className="mono">{f.rule}</span>
                  <span className="text-2">{f.message}</span>
                </div>
              ))}
            </div>
            <dl className="kv">
              <dt>Kind</dt>
              <dd>{r.kind}</dd>
              <dt>Arguments (SHA-256)</dt>
              <dd className="hash">{r.args_sha256}</dd>
            </dl>
            {canDecide ? (
              <ApprovalDecision orgId={org.id} approvalId={r.id} label={`${r.server_id}/${r.tool_name}`} />
            ) : (
              <p className="small muted">Only owners and admins can decide.</p>
            )}
          </article>
        ))}
      </section>

      <section aria-labelledby="done-h" className="glass" data-light>
        <h2 id="done-h" style={{ fontSize: "1.05rem", padding: "16px 16px 4px" }}>
          Decided and expired
        </h2>
        {done.length === 0 ? (
          <p className="small muted" style={{ padding: "0 16px 16px" }}>No decisions yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Decided and expired approval requests</caption>
              <thead>
                <tr>
                  <th scope="col">Call</th>
                  <th scope="col">Status</th>
                  <th scope="col">Rules</th>
                  <th scope="col">Asked</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {done.map((r) => (
                  <tr key={r.id}>
                    <td className="mono small">{r.server_id}/{r.tool_name}</td>
                    <td><span className={`badge badge-${status(r)}`}>{status(r)}</span></td>
                    <td className="mono small">{r.findings.map((f) => f.rule).join(", ")}</td>
                    <td className="small muted">{fmtDate(r.created_at)}</td>
                    <td className="small text-2">{r.decision_note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <Icon name="info" size={16} />
        <span>Verfy sends only the tool, the rules that asked and a hash of the arguments, never the arguments themselves. Approving lets this one call run.</span>
      </div>
    </>
  );
}
