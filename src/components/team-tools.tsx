"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Role } from "@/core/permissions";
import { api } from "./api";
import { CopyButton } from "./copy-button";
import { ConfirmAction } from "./decision-buttons";
import { Icon } from "./icons";
import { ErrorNote } from "./states";

export function InviteForm({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin" | "auditor">("member");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    const res = await api<{ link: string }>("POST", `/api/v1/orgs/${orgId}/invitations`, { email, role });
    setBusy(false);
    if (!res.ok || !res.data) return setError(res.error ?? "The invitation could not be created.");
    setLink(res.data.link);
    setEmail("");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="stack">
      {error && <ErrorNote message={error} />}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 240px" }}>
          <label htmlFor="inv-email">Email</label>
          <input id="inv-email" type="email" className="input" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field" style={{ flex: "0 1 160px" }}>
          <label htmlFor="inv-role">Role</label>
          <select id="inv-role" className="select input" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="member">Member</option>
            <option value="auditor">Auditor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Icon name="mail" size={16} />
          <span>{busy ? "Creating…" : "Create invite link"}</span>
        </button>
      </div>
      {link && (
        <div className="alert alert-success" role="status" style={{ flexWrap: "wrap" }}>
          <Icon name="check" size={16} />
          <span style={{ flex: "1 1 300px", overflowWrap: "anywhere" }}>
            Send this link to the person yourself; Atls does not send email. It works once, for that address, for 7 days.
            <br />
            <code className="mono small">{link}</code>
          </span>
          <CopyButton text={link} label="Copy link" />
        </div>
      )}
    </form>
  );
}

export function RoleSelect({ orgId, userId, role, actorRole, isSelf }: { orgId: string; userId: string; role: Role; actorRole: Role; isSelf: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [error, setError] = useState<string | null>(null);
  const locked = actorRole !== "owner" && role === "owner";
  async function change(next: Role) {
    setError(null);
    const prev = value;
    setValue(next);
    const res = await api("PATCH", `/api/v1/orgs/${orgId}/members/${userId}`, { role: next });
    if (!res.ok) {
      setValue(prev);
      setError(res.error ?? "The role could not be changed.");
      return;
    }
    router.refresh();
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label className="visually-hidden" htmlFor={`role-${userId}`}>
        Role
      </label>
      <select id={`role-${userId}`} className="select input" style={{ minHeight: 36, padding: "4px 10px" }} value={value} disabled={locked} onChange={(e) => change(e.target.value as Role)}>
        {(actorRole === "owner" ? ["owner", "admin", "member", "auditor"] : ["admin", "member", "auditor"]).concat(locked ? ["owner"] : []).map((r) => (
          <option key={r} value={r}>
            {r}
            {isSelf ? " (you)" : ""}
          </option>
        ))}
      </select>
      {error && <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}

export function RemoveMember({ orgId, userId, email, isSelf }: { orgId: string; userId: string; email: string; isSelf: boolean }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={isSelf ? "Leave" : "Remove"}
      title={isSelf ? "Leave this organization?" : `Remove ${email}?`}
      body={isSelf ? "You lose access to its receipts, policies and devices." : "They lose access immediately. Devices they enrolled keep working until you revoke them on the Devices page."}
      confirm={isSelf ? "Leave" : "Remove member"}
      onConfirm={async () => {
        const res = await api("DELETE", `/api/v1/orgs/${orgId}/members/${userId}`);
        if (!res.ok) return res.error ?? "The member could not be removed.";
        if (isSelf) {
          document.cookie = "atls_org=; Path=/; Max-Age=0";
          router.push("/dashboard");
        }
        router.refresh();
        return null;
      }}
    />
  );
}

export function RevokeInvite({ orgId, id, email }: { orgId: string; id: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function revoke() {
    setBusy(true);
    setError(null);
    const res = await api("DELETE", `/api/v1/orgs/${orgId}/invitations/${id}`);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "The invitation could not be revoked.");
    router.refresh();
  }
  return (
    <span className="row" style={{ gap: 6 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={revoke} disabled={busy} aria-label={`Revoke the invitation for ${email}`}>
        <Icon name="x" size={14} />
        <span>{busy ? "Revoking…" : "Revoke"}</span>
      </button>
      {error && <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}
