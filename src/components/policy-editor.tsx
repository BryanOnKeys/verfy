"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Simulation } from "@/core/policy";
import { api } from "./api";
import { Icon } from "./icons";
import { ErrorNote } from "./states";

export function PolicyEditor({ orgId, initial, version, canPublish }: { orgId: string; initial: Record<string, unknown>; version: number; canPublish: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  const [note, setNote] = useState("");
  const [sim, setSim] = useState<Simulation | null>(null);
  const [simFor, setSimFor] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<"sim" | "pub" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function parse(): Record<string, unknown> | null {
    try {
      const v = JSON.parse(text);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("The policy must be a JSON object.");
      return v as Record<string, unknown>;
    } catch (e) {
      setError(e instanceof SyntaxError ? `Not valid JSON: ${e.message}` : (e as Error).message);
      return null;
    }
  }

  async function simulate() {
    setError(null);
    setDone(null);
    const body = parse();
    if (!body) return;
    setBusy("sim");
    const res = await api<Simulation>("POST", "/api/v1/policies/simulate", { org_id: orgId, body });
    setBusy(null);
    if (!res.ok || !res.data) return setError(res.error ?? "The simulation failed.");
    setSim(res.data);
    setSimFor(text);
    setAck(false);
  }

  async function publish() {
    setError(null);
    setDone(null);
    const body = parse();
    if (!body) return;
    setBusy("pub");
    const res = await api<{ version: number }>("PUT", "/api/v1/policies/current", {
      org_id: orgId,
      body,
      note: note.trim() || undefined,
      expected_version: version,
      acknowledge_lockout: ack,
    });
    setBusy(null);
    if (!res.ok || !res.data) {
      const s = (res.problem as { simulation?: Simulation } | undefined)?.simulation;
      if (s) {
        setSim(s);
        setSimFor(text);
      }
      return setError(res.error ?? "The policy could not be published.");
    }
    setDone(`Published as version ${res.data.version}. Devices pick it up with verfy team pull.`);
    setNote("");
    router.refresh();
  }

  const stale = sim !== null && simFor !== text;

  return (
    <div className="stack">
      {error && <ErrorNote message={error} />}
      {done && (
        <div className="alert alert-success" role="status">
          <Icon name="check" size={16} />
          <span>{done}</span>
        </div>
      )}
      <div className="field">
        <label htmlFor="policy-json">Policy (JSON, merged over the Verfy defaults)</label>
        <textarea
          id="policy-json"
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          readOnly={!canPublish}
          aria-describedby="policy-hint"
        />
        <span id="policy-hint" className="hint">
          Keys: agent, on_ask, fail_mode, tools, files, network, payments, rules, disabled_rules, receipts, lock. Local paths (home, workspace) are not allowed in a team policy.
        </span>
      </div>
      {canPublish && (
        <div className="field">
          <label htmlFor="policy-note">Change note (optional)</label>
          <input id="policy-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Block force-push on all repos" />
        </div>
      )}
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={simulate} disabled={busy !== null}>
          <Icon name="gauge" size={16} />
          <span>{busy === "sim" ? "Simulating…" : "Validate and simulate"}</span>
        </button>
        {canPublish && (
          <button type="button" className="btn btn-primary" onClick={publish} disabled={busy !== null || !sim || stale || (sim.lockout && !ack)} title={!sim || stale ? "Run the simulation on this exact text first" : undefined}>
            <span>{busy === "pub" ? "Publishing…" : `Publish as v${version + 1}`}</span>
          </button>
        )}
        {canPublish && (!sim || stale) && <span className="small muted">Simulate the current text before publishing.</span>}
      </div>

      {sim && (
        <section className="glass card stack" aria-labelledby="sim-h" aria-live="polite" data-light>
          <div className="row-between">
            <h3 id="sim-h">Simulation on {sim.total} sample agent actions (Verfy test corpus)</h3>
            {stale && <span className="badge badge-warning">out of date: the text changed</span>}
          </div>
          <div className="grid-3" style={{ gap: 12 }}>
            {(["allow", "ask", "deny"] as const).map((v) => (
              <div key={v} className="kpi">
                <span className="label">{v}</span>
                <span className="value" style={{ fontSize: "1.4rem" }}>
                  {sim.counts.before[v]} → <span style={{ color: v === "allow" ? "var(--success)" : v === "ask" ? "var(--warning)" : "var(--danger)" }}>{sim.counts.after[v]}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="small text-2">
            Everyday actions still allowed: {sim.safe_total - sim.safe_blocked} of {sim.safe_total}.
          </p>
          {sim.warnings.map((w) => (
            <div key={w} className={`alert ${sim.lockout ? "alert-error" : "alert-warning"}`}>
              <Icon name="alert" size={16} />
              <span>{w}</span>
            </div>
          ))}
          {sim.lockout && canPublish && (
            <label className="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I understand this policy blocks most everyday work and want to publish it anyway.
            </label>
          )}
          {sim.changes.length === 0 ? (
            <p className="small muted">No verdict changes compared with the current policy.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">Actions whose verdict changes</caption>
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Before</th>
                    <th scope="col">After</th>
                    <th scope="col">Rules</th>
                  </tr>
                </thead>
                <tbody>
                  {sim.changes.slice(0, 60).map((c) => (
                    <tr key={c.name}>
                      <td className="small">{c.name}</td>
                      <td><span className={`badge badge-${c.before}`}>{c.before}</span></td>
                      <td><span className={`badge badge-${c.after}`}>{c.after}</span></td>
                      <td className="small mono">{c.rules.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
