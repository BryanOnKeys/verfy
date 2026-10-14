import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { PolicyEditor } from "@/components/policy-editor";
import { can } from "@/core/permissions";
import { getCurrentPolicy, listPolicyVersions } from "@/server/data";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Policies" };

export default async function PoliciesPage() {
  const { db, org } = await requirePageOrg("/dashboard/policies");
  const [current, versions] = await Promise.all([getCurrentPolicy(db, org.id), listPolicyVersions(db, org.id)]);
  const canPublish = can(org.role, "policies.publish");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team policy</h1>
          <p>
            Version {current?.version ?? 1}
            {current?.note ? ` · ${current.note}` : ""} · sha256 <span className="mono small">{current?.sha256.slice(0, 16)}…</span>
          </p>
        </div>
        {!canPublish && <span className="badge">Read only for your role ({org.role})</span>}
      </div>

      <div className="grid-side">
        <section className="glass card-lg" aria-label="Edit policy" data-light>
          <PolicyEditor orgId={org.id} initial={current?.body ?? {}} version={current?.version ?? 0} canPublish={canPublish} />
        </section>
        <aside className="stack">
          <section className="glass card stack" aria-labelledby="hist-h" data-light>
            <h2 id="hist-h" style={{ fontSize: "1rem" }}>Version history</h2>
            <div className="timeline">
              {versions.map((v) => (
                <div key={v.version as number}>
                  <div>
                    <div className="small">
                      <strong>v{v.version as number}</strong> {(v.note as string | null) ?? ""}
                    </div>
                    <div className="tiny muted">
                      {fmtDate(v.created_at as string)} · {((v.profiles as unknown as { email: string } | null)?.email) ?? "system"}
                    </div>
                    <div className="tiny hash">{(v.sha256 as string).slice(0, 24)}…</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="alert alert-info">
            <Icon name="info" size={16} />
            <span>
              Publishing is checked by the simulator: Atls replays the sample agent actions from its test corpus under the old and new policy and refuses a
              policy that would block most everyday work, unless you confirm it explicitly.
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}
