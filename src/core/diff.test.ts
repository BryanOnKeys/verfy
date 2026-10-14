import { describe, expect, it } from "vitest";
import { diffLines, prettyDefinition, showInvisible } from "./diff";

describe("definition diff", () => {
  it("marks added and removed lines", () => {
    const d = diffLines(["a", "b", "c"], ["a", "x", "c", "d"]);
    expect(d).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
      { op: "add", text: "x" },
      { op: "same", text: "c" },
      { op: "add", text: "d" },
    ]);
  });

  it("spells out invisible characters", () => {
    expect(showInvisible("read​file\u{E0041}")).toBe("read<U+200B>file<U+E0041>");
    const lines = prettyDefinition({ name: "t", description: "ok⁠" });
    expect(lines.join("\n")).toContain("<U+2060>");
  });

  it("is deterministic regardless of key order", () => {
    expect(prettyDefinition({ b: 1, a: { d: 1, c: 2 } })).toEqual(prettyDefinition({ a: { c: 2, d: 1 }, b: 1 }));
  });

  it("falls back to a replacement for huge inputs", () => {
    const d = diffLines(["a", "b"], ["c"], 1);
    expect(d.map((l) => l.op)).toEqual(["del", "del", "add"]);
  });
});
