"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { ErrorNote } from "./states";

export function LockDecision({ orgId, lockId, label }: { orgId: string; lockId: string; label: string }) {
  return <Decision orgId={orgId} path={`/api/v1/locks/${lockId}`} id={lockId} label={label} approveText="Approve for the team" />;
}

export function ApprovalDecision({ orgId, approvalId, label }: { orgId: string; approvalId: string; label: string }) {
  return <Decision orgId={orgId} path={`/api/v1/approvals/${approvalId}`} id={approvalId} label={label} approveText="Allow this call" />;
}

function Decision({ orgId, path, id, label, approveText }: { orgId: string; path: string; id: string; label: string; approveText: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    const res = await api("POST", `${path}/${kind}`, { org_id: orgId, note: note.trim() || undefined });
    setBusy(null);
    if (!res.ok) return setError(res.error ?? "The decision could not be saved.");
    router.refresh();
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      {error && <ErrorNote message={error} />}
      <div className="field">
        <label htmlFor={`note-${id}`}>Decision note (optional)</label>
        <input id={`note-${id}`} className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => decide("approve")} disabled={busy !== null} aria-label={`Approve ${label}`}>
          <Icon name="check" size={14} />
          <span>{busy === "approve" ? "Approving…" : approveText}</span>
        </button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => decide("reject")} disabled={busy !== null} aria-label={`Reject ${label}`}>
          <Icon name="x" size={14} />
          <span>{busy === "reject" ? "Rejecting…" : "Reject"}</span>
        </button>
      </div>
    </div>
  );
}

/** A destructive action behind a native modal dialog (focus is trapped and restored by the browser). */
export function ConfirmAction({
  trigger,
  title,
  body,
  confirm,
  onConfirm,
}: {
  trigger: string;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => Promise<string | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    const err = await onConfirm();
    setBusy(false);
    if (err) setError(err);
    else ref.current?.close();
  }
  return (
    <>
      <button type="button" className="btn btn-danger btn-sm" onClick={() => ref.current?.showModal()}>
        <span>{trigger}</span>
      </button>
      <dialog ref={ref} className="modal" aria-labelledby={`dlg-${trigger}-${title}`.replace(/\W+/g, "-")}>
        <div className="glass card-lg stack">
          <h2 id={`dlg-${trigger}-${title}`.replace(/\W+/g, "-")} style={{ fontSize: "1.2rem" }}>
            {title}
          </h2>
          <p className="text-2">{body}</p>
          {error && <ErrorNote message={error} />}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()} autoFocus>
              <span>Cancel</span>
            </button>
            <button type="button" className="btn btn-danger" onClick={run} disabled={busy}>
              <span>{busy ? "Working…" : confirm}</span>
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
