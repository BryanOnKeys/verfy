"use client";

import { useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";

interface Report {
  ok: boolean;
  count: number;
  head: string | null;
  errors: { index: number; seq: unknown; error: string }[];
  truncated: boolean;
  verified_at: string;
}

export function VerifyChain({ orgId, chainId }: { orgId: string; chainId: string }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    const res = await api<Report>("GET", `/api/v1/chains/${chainId}/verify?org=${orgId}`);
    setBusy(false);
    if (!res.ok || !res.data) setError(res.error ?? "Verification failed to run.");
    else setReport(res.data);
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={run} disabled={busy} style={{ justifySelf: "start" }}>
        <Icon name="shieldCheck" size={16} />
        <span>{busy ? "Verifying…" : "Verify the whole chain on the server"}</span>
      </button>
      <div aria-live="polite">
        {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
        {report &&
          (report.ok ? (
            <div className="alert alert-success">
              <Icon name="check" size={16} />
              <span>
                All {report.count} receipts verified: every Ed25519 signature is valid and every hash link is intact.{report.truncated ? " (Only the first 100,000 were checked.)" : ""}
              </span>
            </div>
          ) : (
            <div className="alert alert-error">
              <Icon name="alert" size={16} />
              <span>
                {report.errors.length} problem(s) in {report.count} receipts: {report.errors.slice(0, 3).map((e) => `#${String(e.seq)} ${e.error}`).join("; ")}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

export function DownloadJson({ data, filename, label = "Download JSON" }: { data: unknown; filename: string; label?: string }) {
  function download() {
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
      <Icon name="download" size={16} />
      <span>{label}</span>
    </button>
  );
}
