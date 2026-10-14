"use client";

import { useState } from "react";
import { Icon } from "./icons";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 1800);
  }
  return (
    <button type="button" className="btn btn-secondary btn-sm copy" onClick={copy} aria-live="polite">
      <Icon name={state === "done" ? "check" : "copy"} size={14} />
      <span>{state === "done" ? "Copied" : state === "error" ? "Copy failed" : label}</span>
    </button>
  );
}

export function CodeBlock({ code, copy = true, label }: { code: string; copy?: boolean; label?: string }) {
  const lines = code.split("\n");
  return (
    <div className="code" role="group" aria-label={label ?? "Code"}>
      {copy && <CopyButton text={lines.filter((l) => !l.trim().startsWith("#")).map((l) => (l.startsWith("$ ") ? l.slice(2) : l)).join("\n").trim()} />}
      <pre>
        <code>
          {lines.map((line, i) => (
            <span key={i}>
              {line.trim().startsWith("#") ? <span className="comment">{line}</span> : line.startsWith("$ ") ? <><span className="prompt">$ </span>{line.slice(2)}</> : line}
              {i < lines.length - 1 ? "\n" : ""}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
