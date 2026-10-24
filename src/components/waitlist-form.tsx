"use client";

import { useState } from "react";
import { TEAM_SIZES, WAITLIST_AGENTS } from "@/core/waitlist";
import { Icon } from "./icons";

/** The Verfy Cloud waitlist. Posts to /api/v1/waitlist; nothing is shared with a third party. */
export function WaitlistForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/v1/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(f.get("email") ?? ""),
          company: String(f.get("company") ?? ""),
          team_size: String(f.get("team_size") ?? ""),
          agents: f.getAll("agents").map(String),
          website: String(f.get("website") ?? ""),
        }),
      });
      if (res.ok) return setState("done");
      const p = (await res.json().catch(() => null)) as { title?: string; detail?: string } | null;
      setError(res.status === 429 ? "Too many tries from this network. Try again in an hour." : (p?.detail ?? p?.title ?? "That did not work. Try again."));
    } catch {
      setError("Could not reach Verfy. Check your connection and try again.");
    }
    setState("error");
  }

  if (state === "done") {
    return (
      <p className="alert alert-success" role="status">
        <Icon name="check" size={16} />
        <span>You are on the list, so your team&apos;s first three months of Verfy Cloud will be free. We will write once, when it opens, and you can ask us to remove your address at any time.</span>
      </p>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="wl-email">Work email</label>
        <input id="wl-email" name="email" type="email" className="input" autoComplete="email" required maxLength={254} />
      </div>
      <div className="field">
        <label htmlFor="wl-company">Company (optional)</label>
        <input id="wl-company" name="company" type="text" className="input" autoComplete="organization" maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="wl-size">Team size</label>
        <select id="wl-size" name="team_size" className="select input" defaultValue="">
          <option value="">Choose</option>
          {TEAM_SIZES.map((s) => (
            <option key={s} value={s}>
              {s === "1" ? "Just me" : `${s} people`}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Agents you use</legend>
        <div className="row" style={{ gap: "8px 18px" }}>
          {WAITLIST_AGENTS.map(([id, label]) => (
            <label key={id} className="row small" style={{ gap: 6, fontWeight: 500 }}>
              <input type="checkbox" name="agents" value={id} id={`wl-agent-${id}`} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="visually-hidden" aria-hidden="true">
        <label htmlFor="wl-website">Leave this empty</label>
        <input id="wl-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {state === "error" && (
        <p className="alert alert-error" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={state === "sending"} style={{ justifySelf: "start" }}>
        <span>{state === "sending" ? "Joining…" : "Join the waitlist"}</span>
        <Icon name="arrowRight" size={16} className="arrow" />
      </button>
    </form>
  );
}
