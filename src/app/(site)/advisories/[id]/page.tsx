import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getAdvisory } from "@/server/advisories";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: id, description: `Atls Advisory ${id}` };
}

interface Range {
  type: string;
  events: Record<string, string>[];
}

export default async function AdvisoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isConfigured()) {
    return (
      <div className="shell section">
        <NotConfigured />
      </div>
    );
  }
  const a = await getAdvisory(await createClient(), id);
  if (!a) notFound();
  const affected = a.affected as { package: { ecosystem: string; name: string }; ranges?: Range[] }[];

  return (
    <article className="shell section stack-lg" style={{ maxWidth: 880 }}>
      <Link href="/advisories" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }}>
        <span>← All advisories</span>
      </Link>
      <header className="stack">
        <div className="row">
          <span className={`badge badge-${a.severity}`}>{a.severity}</span>
          <code className="mono">{a.id}</code>
          {a.aliases.map((al) => (
            <span key={al} className="badge">{al}</span>
          ))}
        </div>
        <h1 style={{ fontSize: "clamp(1.7rem, 3.2vw, 2.4rem)" }}>{a.summary}</h1>
      </header>

      {a.review_status === "unreviewed" && (
        <div className="alert alert-warning">
          <Icon name="info" size={16} />
          <span>Imported from public sources listed below. Atls has not independently reproduced this issue.</span>
        </div>
      )}

      <section className="glass card-lg stack" data-light>
        <h2 style={{ fontSize: "1.15rem" }}>Details</h2>
        <p className="text-2">{a.details}</p>
      </section>

      <section className="glass card-lg stack" data-light>
        <h2 style={{ fontSize: "1.15rem" }}>Affected</h2>
        {affected.map((af, i) => (
          <div key={i} className="stack" style={{ gap: 6 }}>
            <div>
              <span className="muted small">{af.package.ecosystem}</span> <code className="mono">{af.package.name}</code>
            </div>
            {(af.ranges ?? []).map((r, j) => {
              const introduced = r.events.find((e) => "introduced" in e)?.introduced;
              const fixed = r.events.find((e) => "fixed" in e)?.fixed;
              return (
                <p key={j} className="small text-2">
                  Versions {introduced && introduced !== "0" ? `from ${introduced} ` : ""}before <strong>{fixed ?? "unknown"}</strong>. Fixed in {fixed ?? "no release yet"}.
                </p>
              );
            })}
          </div>
        ))}
        {a.package && a.ecosystem === "npm" && <CodeBlock code={`# check what a project uses\n$ npm ls ${a.package}`} />}
      </section>

      <section className="glass card-lg stack" data-light>
        <h2 style={{ fontSize: "1.15rem" }}>References</h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          {a.references.map((r) => (
            <li key={r.url}>
              <a className="link" href={r.url} rel="noopener noreferrer nofollow" target="_blank">
                {r.url}
              </a>{" "}
              <span className="tiny muted">({r.type ?? "WEB"})</span>
            </li>
          ))}
        </ul>
        <p className="tiny muted">
          Published in Atls {new Date(a.published).toISOString().slice(0, 10)} · modified {new Date(a.modified).toISOString().slice(0, 10)}
        </p>
      </section>
    </article>
  );
}
