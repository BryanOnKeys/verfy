import type { Metadata } from "next";
import { LockDecision } from "@/components/decision-buttons";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { diffLines, prettyDefinition } from "@/core/diff";
import { engine } from "@/core/engine";
import { can } from "@/core/permissions";
import { listLocks } from "@/server/data";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Locks" };

interface LockRow {
  id: string;
  server_id: string;
  tool_name: string;
  digest: string;
  definition: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  devices: { name: string } | null;
}

export default async function LocksPage() {
  const { db, org } = await requirePageOrg("/dashboard/locks");
  const locks = (await listLocks(db, org.id)) as unknown as LockRow[];
  const canDecide = can(org.role, "locks.decide");
  const pending = locks.filter((l) => l.status === "pending");
  const decided = locks.filter((l) => l.status !== "pending");
  const approvedFor = (l: LockRow) =>
    locks.filter((x) => x.status === "approved" && x.server_id === l.server_id && x.tool_name === l.tool_name).sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))[0];

  const reviews = await Promise.all(
    pending.map(async (l) => {
      const base = approvedFor(l);
      const diff = diffLines(prettyDefinition(base?.definition ?? null), prettyDefinition(l.definition));
      const report = await engine.scan([l.definition], l.server_id);
      const digestOk = (await engine.toolPin(l.definition)) === l.digest;
      return { lock: l, base, diff, findings: report.tools[0]?.findings ?? [], digestOk };
    }),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tool locks</h1>
          <p>Changed or new MCP tool definitions proposed by your devices. Approved digests reach every device with atls team pull.</p>
        </div>
      </div>

      <section aria-labelledby="pending-h" className="stack" style={{ marginBottom: 32 }}>
        <h2 id="pending-h" style={{ fontSize: "1.15rem" }}>
          Waiting for review <span className="badge badge-pending">{pending.length}</span>
        </h2>
        {pending.length === 0 && (
          <EmptyState icon="lock" title="Nothing to review" body="When a device sees a changed or new tool, run atls team propose SERVER TOOL and it shows up here." />
        )}
        {reviews.map(({ lock: l, base, diff, findings, digestOk }) => (
          <article key={l.id} className="glass card-lg stack" aria-labelledby={`lock-${l.id}`} data-light>
            <div className="row-between">
              <h3 id={`lock-${l.id}`} className="mono">
                {l.server_id}/{l.tool_name}
              </h3>
              <span className="small muted">
                proposed {fmtDate(l.created_at)}
                {l.devices ? ` by ${l.devices.name}` : ""}
              </span>
            </div>
            <dl className="kv">
              <dt>Approved digest</dt>
              <dd className="hash">{base?.digest ?? "none: this tool was never approved"}</dd>
              <dt>Proposed digest</dt>
              <dd className="hash">
                {l.digest} {digestOk ? <span className="badge badge-ok">matches definition</span> : <span className="badge badge-invalid">does not match definition</span>}
              </dd>
            </dl>
            {findings.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <strong className="small">Scan findings for the proposed definition</strong>
                {findings.map((f, i) => (
                  <div key={i} className="row small" style={{ gap: 8, alignItems: "flex-start", flexWrap: "nowrap" }}>
                    <span className={`badge badge-${f.severity}`}>{f.severity}</span>
                    <span className="mono">{f.rule}</span>
                    <span className="text-2">{f.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="diff" role="region" aria-label={`Changes to ${l.server_id}/${l.tool_name}`} tabIndex={0}>
              {diff.map((d, i) => (
                <div key={i} className={d.op === "same" ? "" : d.op}>
                  {d.op === "add" ? "+ " : d.op === "del" ? "- " : "  "}
                  {d.text}
                </div>
              ))}
            </div>
            {canDecide ? (
              <LockDecision orgId={org.id} lockId={l.id} label={`${l.server_id}/${l.tool_name}`} />
            ) : (
              <p className="small muted">Only owners and admins can approve tool changes.</p>
            )}
          </article>
        ))}
      </section>

      <section aria-labelledby="decided-h" className="glass" data-light>
        <h2 id="decided-h" style={{ fontSize: "1.05rem", padding: "16px 16px 4px" }}>
          Decided
        </h2>
        {decided.length === 0 ? (
          <p className="small muted" style={{ padding: "0 16px 16px" }}>No decisions yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Approved and rejected tool definitions</caption>
              <thead>
                <tr>
                  <th scope="col">Tool</th>
                  <th scope="col">Status</th>
                  <th scope="col">Digest</th>
                  <th scope="col">Decided</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((l) => (
                  <tr key={l.id}>
                    <td className="mono small">{l.server_id}/{l.tool_name}</td>
                    <td><span className={`badge badge-${l.status}`}>{l.status}</span></td>
                    <td className="hash">{l.digest.slice(0, 23)}…</td>
                    <td className="small muted">{fmtDate(l.decided_at)}</td>
                    <td className="small text-2">{l.decision_note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <Icon name="info" size={16} />
        <span>Approving a lock records that this exact definition was reviewed. It does not certify that the tool is safe.</span>
      </div>
    </>
  );
}
