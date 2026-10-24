/**
 * CHANGELOG.md is the single source for the /changelog page. It uses a small
 * subset of Markdown: `## title` starts a release, `- ` lines are its items,
 * any other line is an intro paragraph. Inline: `code`, **bold**, [text](https://…).
 */

export interface Release {
  id: string;
  title: string;
  intro: string[];
  items: string[];
}

export type Inline = { kind: "text" | "code" | "strong"; text: string } | { kind: "link"; text: string; href: string };

export function parseChangelog(md: string): Release[] {
  const out: Release[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      const title = line.slice(3).trim();
      out.push({ id: slug(title), title, intro: [], items: [] });
      continue;
    }
    const current = out[out.length - 1];
    if (!current || !line) continue;
    if (line.startsWith("- ")) current.items.push(line.slice(2).trim());
    else current.intro.push(line);
  }
  return out;
}

function slug(title: string): string {
  return title.toLowerCase().replace(/\(.*?\)/g, "").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "release";
}

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/;

export function parseInline(text: string): Inline[] {
  return text
    .split(TOKEN)
    .filter((part) => part !== "")
    .map((part): Inline => {
      if (part.startsWith("`") && part.endsWith("`")) return { kind: "code", text: part.slice(1, -1) };
      if (part.startsWith("**") && part.endsWith("**")) return { kind: "strong", text: part.slice(2, -2) };
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      // only https links become links; anything else stays plain text
      if (link && link[2]!.startsWith("https://")) return { kind: "link", text: link[1]!, href: link[2]! };
      return { kind: "text", text: part };
    });
}
