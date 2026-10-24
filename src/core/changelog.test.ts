import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChangelog, parseInline } from "./changelog";

describe("changelog", () => {
  it("reads CHANGELOG.md: every CLI release is there, newest first", () => {
    const releases = parseChangelog(readFileSync(path.join(__dirname, "..", "..", "CHANGELOG.md"), "utf8"));
    const versions = releases.map((r) => r.title.split(" ")[0]).filter((v) => /^\d+\.\d+\.\d+$/.test(v!));
    expect(versions.slice(0, 5)).toEqual(["0.5.1", "0.5.0", "0.4.0", "0.3.0", "0.2.0"]);
    expect(releases[0]!.id).toBe("0-5-1");
    for (const r of releases) expect(r.items.length).toBeGreaterThan(0);
  });

  it("matches the CLI version", () => {
    const init = readFileSync(path.join(__dirname, "..", "..", "verfy-cli", "src", "verfy", "__init__.py"), "utf8");
    const version = /__version__ = "(.+?)"/.exec(init)![1];
    const top = parseChangelog(readFileSync(path.join(__dirname, "..", "..", "CHANGELOG.md"), "utf8"))[0]!;
    expect(top.title.startsWith(version + " ")).toBe(true);
  });

  it("turns code, bold and https links into inline parts, and nothing else", () => {
    expect(parseInline("Run `verfy update` on **every** [machine](https://example.com/x) or [this](javascript:void)")).toEqual([
      { kind: "text", text: "Run " },
      { kind: "code", text: "verfy update" },
      { kind: "text", text: " on " },
      { kind: "strong", text: "every" },
      { kind: "text", text: " " },
      { kind: "link", text: "machine", href: "https://example.com/x" },
      { kind: "text", text: " or " },
      { kind: "text", text: "[this](javascript:void)" },
    ]);
  });
});
