import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { parseChangelog, parseInline } from "@/core/changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What changed in the Verfy CLI and website, release by release.",
};

function Text({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.kind === "code" ? (
          <code key={i} className="inline-code">
            {part.text}
          </code>
        ) : part.kind === "strong" ? (
          <strong key={i}>{part.text}</strong>
        ) : part.kind === "link" ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export default function ChangelogPage() {
  // CHANGELOG.md at the repository root; next.config.ts ships it with this page
  const releases = parseChangelog(readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8"));
  return (
    <div className="shell section stack-lg" style={{ maxWidth: 820 }}>
      <header className="section-head">
        <span className="eyebrow">Changelog</span>
        <h1>What changed</h1>
        <p className="lead">
          The Verfy CLI and website, newest first. Update with <code className="inline-code">verfy update</code> or{" "}
          <code className="inline-code">pip install -U verfy</code>. Signed release files are on{" "}
          <a href="https://github.com/anvarbekovjavohir277-dot/verfy/releases" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          .
        </p>
      </header>

      {releases.map((r) => (
        <section key={r.id} id={r.id} className="glass card-lg stack" aria-labelledby={`${r.id}-h`} data-light>
          <h2 id={`${r.id}-h`} style={{ fontSize: "1.3rem" }}>
            {r.title}
          </h2>
          {r.intro.map((p, i) => (
            <p key={i} className="text-2">
              <Text text={p} />
            </p>
          ))}
          <ul className="stack text-2" style={{ paddingLeft: 18, margin: 0, gap: 8 }}>
            {r.items.map((item, i) => (
              <li key={i}>
                <Text text={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
