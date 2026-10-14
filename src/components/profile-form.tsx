"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(app)/settings/actions";
import { Icon } from "./icons";

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfile, {});
  return (
    <form action={action} className="stack" style={{ maxWidth: 420 }}>
      <div className="field">
        <label htmlFor="display_name">Display name</label>
        <input id="display_name" name="display_name" className="input" maxLength={80} defaultValue={displayName} />
        <span className="hint">Shown to teammates instead of your email.</span>
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          <span>{pending ? "Saving…" : "Save"}</span>
        </button>
        <span aria-live="polite" className="small">
          {state.message && (
            <span style={{ color: "var(--success)" }}>
              <Icon name="check" size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> {state.message}
            </span>
          )}
          {state.error && <span style={{ color: "var(--danger)" }}>{state.error}</span>}
        </span>
      </div>
    </form>
  );
}
