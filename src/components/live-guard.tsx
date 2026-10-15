"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Verdict } from "@/core/engine";
import { consoleChain, judge, PRESET, type ConsoleEntry } from "./demo-chains";
import { Icon } from "./icons";

/**
 * The hero console. Verdicts come from the same engine and rules the CLI uses (src/core/engine), on the server for the
 * opening session and in the browser for commands a visitor types; nothing is scripted. The chain under the log shows
 * real SHA-256 links between the demo entries. Nothing is signed, stored or sent anywhere.
 */

type Row = ConsoleEntry & { id: number; verdict: Verdict; why: string };

export function HeroDemo({ initialHashes }: { initialHashes: string[] }) {
  // the opening session plays in line by line; a command you add appears on its own
  const [entries, setEntries] = useState<Row[]>(() => PRESET.map((e, id) => ({ ...e, id, ...judge(e) })));
  const nextId = useRef(PRESET.length);
  const [input, setInput] = useState("");
  const [hashes, setHashes] = useState<string[]>(initialHashes);
  // only a command the visitor adds is announced, not the opening session
  const [announce, setAnnounce] = useState("");

  const counts = useMemo(() => {
    const c = { allow: 0, ask: 0, deny: 0 };
    entries.forEach((e) => (c[e.verdict] += 1));
    return c;
  }, [entries]);

  useEffect(() => {
    if (entries.length && entries[entries.length - 1]!.id < PRESET.length) return; // the server already hashed the opening session
    if (!globalThis.crypto?.subtle) return;
    let cancelled = false;
    consoleChain(entries).then((h) => !cancelled && setHashes(h));
    return () => {
      cancelled = true;
    };
  }, [entries]);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const command = input.trim().slice(0, 300);
    if (!command) return;
    const e: ConsoleEntry = { tool: "Bash", args: { command }, label: command };
    const id = nextId.current++;
    const row = { ...e, id, ...judge(e) };
    setEntries((list) => [...list.slice(-5), row]);
    setAnnounce(`${command}: ${row.verdict}. ${row.why}`);
    setInput("");
  }

  return (
    <div>
      <div className="console">
        <div className="console-head">
          <div className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span>verfy guard · agent session</span>
          <span className="console-tag">live demo</span>
        </div>
        <div className="console-body">
          {entries.map((e) => (
            <div className="line" key={e.id} style={{ animationDelay: e.id < PRESET.length ? `${600 + e.id * 170}ms` : "0ms" }}>
              <span className={`v ${e.verdict}`}>{e.verdict}</span>
              <div>
                <div className="cmd">{e.label}</div>
                <div className="why">{e.why}</div>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="console-try">
          <label>
            <span aria-hidden="true">$</span>
            <span className="visually-hidden">Type a shell command to check</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="try: sudo rm -rf /var"
              autoComplete="off"
              spellCheck={false}
              maxLength={300}
            />
          </label>
          <button className="btn btn-sm" type="submit">
            Check
          </button>
        </form>
        <p className="visually-hidden console-live" aria-live="polite">
          {announce}
        </p>
        <div className="console-chain" aria-label="Receipt chain: each entry carries the hash of the one before it">
          <Icon name="link" size={13} />
          {hashes.map((h, i) => (
            <span key={i} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              {i > 0 && <span className="lnk" aria-hidden="true" />}
              <span className="blk" title={`entry ${i}`}>
                {h}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="console-foot">
        <span>
          <b>{counts.allow}</b> allowed · <b>{counts.ask}</b> waiting for you · <b>{counts.deny}</b> blocked
        </span>
        <span>
          <b>ask</b> pauses the agent until you approve. Real Verfy rules; nothing leaves this page.
        </span>
      </div>
    </div>
  );
}
