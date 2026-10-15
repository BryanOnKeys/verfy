"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import vectors from "../../verfy-cli/tests/fixtures/receipts.json";
import { shownVerdict, TAMPER_CMDS, TAMPER_TARGET as TARGET, verifyChain, type ChainRow, type ChainState } from "./demo-chains";
import { Icon } from "./icons";

/* ---------------------------------------------------------------- tamper demo */
/**
 * Four entries chained with real SHA-256 hashes. The server renders the chain and its check (demo-chains.ts), so the
 * page is right without JavaScript; the button rewrites one verdict after the fact, the way someone covering their
 * tracks would, and the browser re-runs the check to show exactly where the chain breaks. In the product each receipt
 * is also signed with Ed25519 on the device; this demo shows the hash links only.
 */

const noSubscribe = () => () => {};
const hasWebCrypto = () => Boolean(globalThis.crypto?.subtle);

export function TamperDemo({ rows, initialStates }: { rows: ChainRow[]; initialStates: ChainState[] }) {
  const [tampered, setTampered] = useState(false);
  const [states, setStates] = useState<ChainState[]>(initialStates);
  // hashing needs Web Crypto, which browsers only offer on https or localhost (the server always has it)
  const canHash = useSyncExternalStore(noSubscribe, hasWebCrypto, () => true);

  useEffect(() => {
    if (!canHash) return;
    let cancelled = false;
    verifyChain(rows, tampered).then((s) => !cancelled && setStates(s));
    return () => {
      cancelled = true;
    };
  }, [rows, tampered, canHash]);

  const bad = states.some((s) => s !== "ok");
  const label: Record<ChainState, string> = { ok: "verified", edited: "changed after writing", broken: "link broken" };

  return (
    <div className="glass chain-demo">
      <div className="row-between">
        <div>
          <span className="eyebrow">Try it</span>
          <h3 style={{ marginTop: 10, fontSize: "1.25rem" }}>Change one record and watch the chain break</h3>
        </div>
      </div>
      <ol className="chain-rows">
        {rows.map((r, i) => {
          const s = states[i] ?? "ok";
          const verdict = shownVerdict(r, tampered);
          return (
            <li key={r.seq} className={`${s !== "ok" ? "bad" : ""} ${s === "edited" ? "edited" : ""}`}>
              <span className="idx">#{r.seq}</span>
              <span className="what">
                <code>
                  <span className={`badge badge-${verdict}`} style={{ marginRight: 8 }}>
                    {verdict}
                  </span>
                  {r.cmd}
                </code>
                <span>
                  prev {r.prev ? r.prev.slice(7, 13) : "none  "} → hash {r.hash.slice(7, 13)}
                </span>
              </span>
              <span className="state">
                <Icon name={s === "ok" ? "check" : "x"} size={15} />
                {label[s]}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={`chain-status ${bad ? "bad" : "ok"}`} role="status">
        <Icon name={bad ? "alert" : "shieldCheck"} size={18} />
        <span>
          {bad
            ? `Tampering detected: record #${TARGET} was changed after it was written, so #${TARGET + 1} no longer links to it.`
            : `${TAMPER_CMDS.length} records, every link checks out.`}
        </span>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className={`btn ${tampered ? "" : "btn-ink"}`} onClick={() => setTampered((t) => !t)} disabled={!canHash}>
          <Icon name={tampered ? "history" : "file"} size={16} />
          <span>{tampered ? "Undo the change" : `Rewrite #${TARGET} as "allow"`}</span>
        </button>
        <span className="small muted">
          {canHash
            ? "Real SHA-256, recomputed in your browser. Real receipts are also signed with Ed25519."
            : "This browser only offers SHA-256 on secure (https) pages, so the demo can't re-run the check here."}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- receipt anatomy */

const R = vectors.receipts[1]!;
const short = (s: string | null, n = 10) => (s ? (s.length > n + 8 ? `${s.slice(0, n + 7)}…` : s) : "null");

type Seg = [key: string | null, value: string, comma?: boolean];
const LINES: { seg: Seg; part?: string; indent?: number }[] = [
  { seg: [null, "{"] },
  { seg: ["v", `"${R.v}"`, true], part: "v", indent: 1 },
  { seg: ["seq", String(R.seq), true], part: "chain", indent: 1 },
  { seg: ["prev", `"${short(R.prev)}"`, true], part: "chain", indent: 1 },
  { seg: ["issued_at", `"${R.issued_at}"`, true], indent: 1 },
  { seg: ["action", "{"], part: "action", indent: 1 },
  { seg: ["tool", `"${R.action.tool}"`, true], part: "action", indent: 2 },
  { seg: ["args_sha256", `"${short(R.action.args_sha256)}"`], part: "action", indent: 2 },
  { seg: [null, "},"], part: "action", indent: 1 },
  { seg: ["decision", "{"], part: "decision", indent: 1 },
  { seg: ["verdict", `"${R.decision.verdict}"`, true], part: "decision", indent: 2 },
  { seg: ["rules", JSON.stringify(R.decision.rules), true], part: "decision", indent: 2 },
  { seg: ["policy_sha256", `"${short(R.decision.policy_sha256)}"`], part: "decision", indent: 2 },
  { seg: [null, "},"], part: "decision", indent: 1 },
  { seg: ["kid", `"${R.kid}"`, true], part: "sig", indent: 1 },
  { seg: ["sig", `"${short(R.sig, 14)}"`], part: "sig", indent: 1 },
  { seg: [null, "}"] },
];

const NOTES: { part: string; key: string; title: string; text: string }[] = [
  { part: "v", key: "v", title: "Format version", text: "A fixed, documented format. Any tool can parse and check it." },
  { part: "chain", key: "seq, prev", title: "The chain", text: "Each receipt carries the SHA-256 of the one before it. Removing or reordering one breaks every link after it." },
  { part: "action", key: "action", title: "What was attempted", text: "The tool and a hash of its arguments. The arguments themselves stay on the device by default." },
  { part: "decision", key: "decision", title: "What Verfy decided", text: "The verdict, the exact rules that matched, and a hash of the policy in force at that moment." },
  { part: "sig", key: "kid, sig", title: "Who signed it", text: "An Ed25519 signature made on the device. The private key never leaves it; anyone with the public key can verify." },
];

export function ReceiptAnatomy() {
  const [part, setPart] = useState("chain");
  return (
    <div className="glass anatomy">
      <pre className="anatomy-code" aria-label="An verfy.receipt/1 record from the published test vectors">
        {LINES.map((l, i) => (
          <span key={i} className={`ln${l.part && l.part === part ? " on" : ""}`}>
            {"  ".repeat(l.indent ?? 0)}
            {l.seg[0] && (
              <>
                <span className="k">&quot;{l.seg[0]}&quot;</span>
                <span className="d">: </span>
              </>
            )}
            <span className={l.seg[1].startsWith('"') ? "s" : undefined}>{l.seg[1]}</span>
            {l.seg[2] ? <span className="d">,</span> : null}
          </span>
        ))}
      </pre>
      <ul className="anatomy-notes">
        {NOTES.map((n) => (
          <li key={n.part}>
            <button type="button" aria-pressed={part === n.part} onClick={() => setPart(n.part)} onMouseEnter={() => setPart(n.part)} onFocus={() => setPart(n.part)}>
              <span className="key">{n.key}</span>
              <strong>{n.title}</strong>
              <span className="note">{n.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
