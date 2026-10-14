/**
 * Line diff (longest common subsequence) for showing what changed in a tool
 * definition. Invisible and control characters are spelled out, so a hidden
 * instruction cannot slip through a review looking like an unchanged line.
 */

export type DiffLine = { op: "same" | "add" | "del"; text: string };

const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F­​-‏‪-‮⁠-⁯﻿]|[\u{E0000}-\u{E007F}]/gu;

export function showInvisible(s: string): string {
  return s.replace(INVISIBLE, (ch) => `<U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`);
}

export function prettyDefinition(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  return showInvisible(JSON.stringify(sortKeys(v), null, 2)).split("\n");
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}

export function diffLines(a: string[], b: string[], maxCells = 4_000_000): DiffLine[] {
  if (a.length * b.length > maxCells) {
    // too large to align: show it as a full replacement
    return [...a.map((text) => ({ op: "del" as const, text })), ...b.map((text) => ({ op: "add" as const, text }))];
  }
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "del", text: a[i++]! });
    } else {
      out.push({ op: "add", text: b[j++]! });
    }
  }
  while (i < n) out.push({ op: "del", text: a[i++]! });
  while (j < m) out.push({ op: "add", text: b[j++]! });
  return out;
}
