import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { DownloadJson, VerifyChain } from "@/components/receipt-tools";
import { getReceipt } from "@/server/data";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Receipt" };

const SIG: Record<string, [string, string]> = {
  valid: ["badge-valid", "Signature valid"],
  invalid: ["badge-invalid", "Signature INVALID"],
  unknown_key: ["badge-pending", "Signing key unknown"],
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db, org } = await requirePageOrg(`/dashboard/receipts/${id}`);
  const r = await getReceipt(db, org.id, id);
  if (!r) notFound();
  const body = r.body as Record<string, unknown> & {
    action: { args_sha256: string; args?: unknown };
    decision: { rules: string[]; policy_sha256: string; approved_by?: string };
    outcome: { result_sha256: string | null };
  };
  const device = r.devices as { id: string; name: string; kid: string; status: string; public_key: string } | null;
  const chain = r.chains as { chain_id: string; last_seq: number } | null;
  const [sigClass, sigText] = SIG[r.signature] ?? SIG.unknown_key!;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/dashboard/receipts" className="small muted">
            ← Receipts
          </Link>
          <h1 style={{ marginTop: 6 }}>
            {r.server ? `${r.server}/` : ""}
            {r.tool}
          </h1>
          <div className="row" style={{ marginTop: 10 }}>
            <span className={`badge badge-${r.verdict}`}>{r.verdict}</span>
            <span className={`badge ${sigClass}`}>
              <Icon name={r.signature === "valid" ? "check" : "alert"} size={12} />
              {sigText}
            </span>
            <span className="badge">{r.outcome_status}</span>
            <span className={`badge ${r.has_args ? "badge-warning" : "badge-ok"}`}>{r.has_args ? "arguments stored (redacted)" : "arguments: hash only"}</span>
          </div>
        </div>
        <DownloadJson data={r.body} filename={`${r.receipt_id}.json`} />
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="glass card stack" aria-labelledby="what-h" data-light>
          <h2 id="what-h" style={{ fontSize: "1rem" }}>What happened</h2>
          <dl className="kv">
            <dt>Issued</dt>
            <dd>{fmtDate(r.issued_at)}</dd>
            <dt>Received</dt>
            <dd>{fmtDate(r.received_at)}</dd>
            <dt>Agent · session</dt>
            <dd>
              {r.agent} · <span className="mono small">{r.session}</span>
            </dd>
            <dt>Action kind</dt>
            <dd>{r.kind}</dd>
            <dt>Rules</dt>
            <dd className="mono small">{body.decision.rules.length ? body.decision.rules.join(", ") : "none (no rule matched)"}</dd>
            {body.decision.approved_by && (
              <>
                <dt>Approved by</dt>
                <dd>{body.decision.approved_by}</dd>
              </>
            )}
            <dt>Arguments SHA-256</dt>
            <dd className="hash">{body.action.args_sha256}</dd>
            <dt>Result SHA-256</dt>
            <dd className="hash">{body.outcome.result_sha256 ?? "—"}</dd>
            <dt>Policy SHA-256</dt>
            <dd className="hash">{body.decision.policy_sha256}</dd>
            <dt>Tool digest</dt>
            <dd className="hash">{(r.tool_sha256 as string | null) ?? "— (not seen through the gateway)"}</dd>
          </dl>
        </section>

        <section className="glass card stack" aria-labelledby="chain-h" data-light>
          <h2 id="chain-h" style={{ fontSize: "1rem" }}>Position in the chain</h2>
          <div className="timeline">
            <div>
              <div>
                <div className="small muted">previous (seq {r.seq - 1 >= 0 ? r.seq - 1 : "none"})</div>
                <div className="hash">{(r.prev as string | null) ?? "null: first receipt of this device"}</div>
              </div>
            </div>
            <div>
              <div>
                <div className="small">
                  <strong>this receipt</strong> · seq {r.seq} of {chain ? chain.last_seq + 1 : "?"}
                </div>
                <div className="hash">{r.hash as string}</div>
              </div>
            </div>
          </div>
          <dl className="kv">
            <dt>Device</dt>
            <dd>
              {device ? (
                <>
                  {device.name} <span className={`badge badge-${device.status}`}>{device.status}</span>
                </>
              ) : (
                "—"
              )}
            </dd>
            <dt>Key ID (chain)</dt>
            <dd className="mono small">{chain?.chain_id ?? "—"}</dd>
            <dt>Device public key</dt>
            <dd className="hash">{device?.public_key ?? "—"}</dd>
          </dl>
          {chain && <VerifyChain orgId={org.id} chainId={chain.chain_id} />}
        </section>
      </div>

      <section className="glass card stack" style={{ marginTop: 16 }} aria-labelledby="raw-h" data-light>
        <h2 id="raw-h" style={{ fontSize: "1rem" }}>Signed receipt</h2>
        <p className="small muted">This is the exact object the device signed. Verify it offline with <code className="inline-code">atls verify --pub &lt;device public key&gt;</code>.</p>
        <div className="code">
          <pre>
            <code>{JSON.stringify(r.body, null, 2)}</code>
          </pre>
        </div>
      </section>

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <Icon name="info" size={16} />
        <span>
          This receipt proves the decision Atls made for this call and that the record has not been changed since it was signed. It does not show what the
          tool did internally.
        </span>
      </div>
    </>
  );
}
