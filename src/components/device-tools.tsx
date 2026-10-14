"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";
import { CodeBlock } from "./copy-button";
import { ConfirmAction } from "./decision-buttons";
import { Icon } from "./icons";
import { ErrorNote } from "./states";

export function AddDevice({ orgId, appUrl }: { orgId: string; appUrl: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setBusy(true);
    setError(null);
    const res = await api<{ code: string }>("POST", "/api/v1/devices/enrollments", { org_id: orgId });
    setBusy(false);
    if (!res.ok || !res.data) return setError(res.error ?? "The code could not be created.");
    setCode(res.data.code);
  }
  return (
    <div className="stack">
      {error && <ErrorNote message={error} />}
      {!code ? (
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy} style={{ justifySelf: "start" }}>
          <Icon name="device" size={16} />
          <span>{busy ? "Creating…" : "Add a device"}</span>
        </button>
      ) : (
        <div className="stack">
          <div className="alert alert-warning">
            <Icon name="key" size={16} />
            <span>This one-time code is shown only now and expires in one hour. Run the command on the device you want to enroll.</span>
          </div>
          <CodeBlock code={`$ atls team enroll --url ${appUrl} --code ${code}`} label="Enrollment command" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCode(null)} style={{ justifySelf: "start" }}>
            <span>Done</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function RevokeDevice({ orgId, deviceId, name }: { orgId: string; deviceId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger="Revoke"
      title={`Revoke ${name}?`}
      body="Its device token stops working immediately, so it can no longer upload receipts or read the team policy. Receipts it already uploaded stay and remain verifiable. This cannot be undone; enroll the device again to reconnect it."
      confirm="Revoke device"
      onConfirm={async () => {
        const res = await api("POST", `/api/v1/devices/${deviceId}/revoke`, { org_id: orgId });
        if (!res.ok) return res.error ?? "The device could not be revoked.";
        router.refresh();
        return null;
      }}
    />
  );
}
