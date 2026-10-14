"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { ErrorNote } from "./states";

const day = (d: Date) => d.toISOString().slice(0, 10);

export function NewExport({ orgId }: { orgId: string }) {
  const router = useRouter();
  const today = new Date();
  const [from, setFrom] = useState(day(new Date(today.getTime() - 30 * 86_400_000)));
  const [to, setTo] = useState(day(today));
  const [verdict, setVerdict] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await api<{ receipt_count: number; manifest_sha256: string }>("POST", "/api/v1/exports", {
      org_id: orgId,
      from: `${from}T00:00:00Z`,
      to: new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString(),
      verdict: verdict || undefined,
    });
    setBusy(false);
    if (!res.ok || !res.data) return setError(res.error ?? "The export could not be created.");
    setDone(`Export ready: ${res.data.receipt_count} receipts. Manifest SHA-256 ${res.data.manifest_sha256.slice(0, 16)}…`);
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="stack">
      {error && <ErrorNote message={error} />}
      {done && (
        <div className="alert alert-success" role="status">
          <Icon name="check" size={16} />
          <span>{done}</span>
        </div>
      )}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label htmlFor="exp-from">From</label>
          <input id="exp-from" type="date" className="input" required value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="exp-to">To (inclusive)</label>
          <input id="exp-to" type="date" className="input" required value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="exp-verdict">Verdict</label>
          <select id="exp-verdict" className="select input" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
            <option value="">All</option>
            <option value="allow">Allow</option>
            <option value="ask">Ask</option>
            <option value="deny">Deny</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Icon name="download" size={16} />
          <span>{busy ? "Building…" : "Create export"}</span>
        </button>
      </div>
      <p className="hint">Up to 20,000 receipts per export. Every export is recorded in the audit log.</p>
    </form>
  );
}

export function DownloadExport({ orgId, exportId }: { orgId: string; exportId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(which: "receipts" | "manifest") {
    setBusy(true);
    setError(null);
    const res = await api<{ downloads: { receipts: string; manifest: string } | null }>("GET", `/api/v1/exports/${exportId}?org=${orgId}`);
    setBusy(false);
    const url = res.data?.downloads?.[which];
    if (!res.ok || !url) return setError(res.error ?? "No download is available.");
    window.location.assign(url);
  }
  return (
    <span className="row" style={{ gap: 6 }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => go("receipts")} disabled={busy}>
        <span>receipts.jsonl</span>
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => go("manifest")} disabled={busy}>
        <span>manifest.json</span>
      </button>
      {error && <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}
