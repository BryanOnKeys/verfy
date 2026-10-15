"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";
import { ErrorNote } from "./states";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    setBusy(true);
    setError(null);
    const res = await api<{ org_id: string }>("POST", "/api/v1/invitations/accept", { token });
    if (!res.ok || !res.data) {
      setError(res.error ?? "The invitation could not be accepted.");
      setBusy(false);
      return;
    }
    document.cookie = `verfy_org=${res.data.org_id}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    router.push("/dashboard");
    router.refresh();
  }
  return (
    <div className="stack">
      {error && <ErrorNote message={error} />}
      <button type="button" className="btn btn-primary" onClick={accept} disabled={busy}>
        <span>{busy ? "Joining…" : "Accept invitation"}</span>
      </button>
    </div>
  );
}
