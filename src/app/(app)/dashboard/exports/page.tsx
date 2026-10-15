import type { Metadata } from "next";
import { CodeBlock } from "@/components/copy-button";
import { DownloadExport, NewExport } from "@/components/export-tools";
import { EmptyState, PermissionDenied } from "@/components/states";
import { can } from "@/core/permissions";
import { fromDbError } from "@/server/http";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Exports" };

export default async function ExportsPage() {
  const { db, org } = await requirePageOrg("/dashboard/exports");
  if (!can(org.role, "exports.read")) return <PermissionDenied what="create or download evidence exports" />;
  const { data, error } = await db
    .from("exports")
    .select("id, status, from_ts, to_ts, filters, receipt_count, manifest_sha256, error, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw fromDbError(error);
  const rows = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Evidence exports</h1>
          <p>Signed receipts as JSONL plus a manifest with SHA-256 hashes and device public keys, for auditors who verify without trusting Verfy.</p>
        </div>
      </div>

      {can(org.role, "exports.create") && (
        <section className="glass card-lg" style={{ marginBottom: 16 }} aria-label="New export" data-light>
          <NewExport orgId={org.id} />
        </section>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="download" title="No exports yet" body="Create one above. Downloads use links that expire after 60 seconds." />
      ) : (
        <div className="glass" data-light>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Evidence exports</caption>
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Range</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Receipts</th>
                  <th scope="col">Manifest SHA-256</th>
                  <th scope="col">Download</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id as string}>
                    <td className="small muted">{fmtDate(e.created_at as string)}</td>
                    <td className="small">
                      {(e.from_ts as string).slice(0, 10)} → {(e.to_ts as string).slice(0, 10)}
                      {(e.filters as { verdict?: string })?.verdict ? ` · ${(e.filters as { verdict: string }).verdict}` : ""}
                    </td>
                    <td>
                      <span className={`badge badge-${e.status as string}`}>{e.status as string}</span>
                      {e.error && <div className="tiny" style={{ color: "var(--danger)" }}>{e.error as string}</div>}
                    </td>
                    <td className="num">{(e.receipt_count as number | null)?.toLocaleString("en-US") ?? "—"}</td>
                    <td className="hash">{e.manifest_sha256 ? `${(e.manifest_sha256 as string).slice(0, 16)}…` : "—"}</td>
                    <td>{e.status === "ready" ? <DownloadExport orgId={org.id} exportId={e.id as string} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="glass card stack" style={{ marginTop: 16 }} aria-labelledby="verify-h" data-light>
        <h2 id="verify-h" style={{ fontSize: "1rem" }}>How a recipient verifies an export</h2>
        <CodeBlock
          code={[
            "# 1. the file matches the manifest",
            "$ sha256sum receipts.jsonl          # equals manifest.receipts_sha256",
            "# 2. each chain verifies with its device public key (from manifest.chains)",
            "$ verfy verify --ledger receipts.jsonl --pub <public_key> --kid <chain_id>",
            "# if the chain starts mid-way (starts_after is not null):",
            "$ verfy verify --ledger receipts.jsonl --pub <public_key> --kid <chain_id> --start-after <starts_after>",
          ].join("\n")}
        />
        <p className="small muted">The manifest lists each chain (one per device) with its public key, first and last seq, and the hash it starts after.</p>
      </section>
    </>
  );
}
