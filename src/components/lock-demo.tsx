"use client";

import { useEffect, useState } from "react";
import { RUG_APPROVED, RUG_SERVER, RUG_TOOL, RUG_UPDATE, rugPull, type RugState } from "./demo-chains";
import { Icon } from "./icons";

/**
 * The hero demo: a tool is locked, its server quietly rewrites the description, Verfy blocks the next call and the
 * decision becomes a chained receipt. Digests, scan findings and the verdict come from the same engine the CLI uses
 * (src/core/engine); the server computes the opening state and the browser recomputes it when a visitor edits the
 * description. Nothing is signed, stored or sent anywhere.
 */
export function LockDemo({ initial }: { initial: RugState }) {
  const [description, setDescription] = useState(RUG_UPDATE);
  // the browser's result for the description it was computed from; the opening description uses the server's
  const [computed, setComputed] = useState<{ description: string; state: RugState } | null>(null);
  const state = description === RUG_UPDATE ? initial : (computed?.state ?? initial);

  useEffect(() => {
    if (description === RUG_UPDATE || !globalThis.crypto?.subtle) return;
    let cancelled = false;
    rugPull(description).then((s) => !cancelled && setComputed({ description, state: s }));
    return () => {
      cancelled = true;
    };
  }, [description]);

  const changed = state.current !== state.locked;
  const tool = `${RUG_SERVER}/${RUG_TOOL.name}`;
  return (
    <div>
      <div className="console">
        <div className="console-head">
          <div className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span>verfy lock · {tool}</span>
          <span className="console-tag">live demo</span>
        </div>
        <div className="console-body" aria-live="polite">
          <div className="line" style={{ animationDelay: "500ms" }}>
            <span className="v allow">lock</span>
            <div>
              <div className="cmd">Monday: you approve {tool}</div>
              <div className="why">
                &quot;{RUG_APPROVED}&quot; · pinned {state.locked.slice(0, 19)}
              </div>
            </div>
          </div>
          <div className="line" style={{ animationDelay: "900ms" }}>
            <span className={`v ${changed ? "ask" : "allow"}`}>{changed ? "drift" : "same"}</span>
            <div>
              <div className="cmd">Friday: the server ships an update</div>
              {changed ? (
                <div className="why diff-why">
                  <span className="diff-del">- {RUG_APPROVED}</span>
                  <span className="diff-add">+ {description}</span>
                  <span>now {state.current.slice(0, 19)}</span>
                </div>
              ) : (
                <div className="why">The definition still matches verfy.lock.</div>
              )}
            </div>
          </div>
          <div className="line" style={{ animationDelay: "1300ms" }}>
            <span className={`v ${state.verdict}`}>{state.verdict}</span>
            <div>
              <div className="cmd">The agent calls read_file src/app.ts</div>
              <div className="why">{state.why}</div>
            </div>
          </div>
          {state.findings
            .filter((f) => !f.startsWith("VFY-SCAN-014"))
            .slice(0, 2)
            .map((f, i) => (
              <div className="line" key={f} style={{ animationDelay: `${1600 + i * 200}ms` }}>
                <span className="v deny">scan</span>
                <div>
                  <div className="why" style={{ marginTop: 0 }}>
                    {f}
                  </div>
                </div>
              </div>
            ))}
        </div>
        <form className="console-try" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span aria-hidden="true">✎</span>
            <span className="visually-hidden">The description the server serves today</span>
            <input value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} autoComplete="off" spellCheck={false} maxLength={300} />
          </label>
          <button className="btn btn-sm" type="button" onClick={() => setDescription(changed ? RUG_APPROVED : RUG_UPDATE)}>
            {changed ? "Undo update" : "Ship update"}
          </button>
        </form>
        <div className="console-chain" aria-label="The receipt for this decision">
          <Icon name="receipt" size={13} />
          <span>receipt #41 · {state.verdict} · tool {state.current.slice(7, 19)}</span>
          <span className="lnk" aria-hidden="true" />
          <span className="blk">{state.receipt.slice(7, 19)}</span>
        </div>
      </div>
      <div className="console-foot">
        <span>
          Edit the description: <b>any change</b>, even one character, changes the digest.
        </span>
        <span>Real Verfy rules and SHA-256; nothing leaves this page.</span>
      </div>
    </div>
  );
}
