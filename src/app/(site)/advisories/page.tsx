import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { EmptyState, ErrorNote, NotConfigured } from "@/components/states";
import { isConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { advisoryQuery, listAdvisories, type AdvisoryRow } from "@/server/advisories";

export const metadata: Metadata = {
  title: "Verfy Advisories",
  description: "Known vulnerabilities in MCP servers and agent tooling, in OSV format, with sources.",
};

export default async function AdvisoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const parsed = advisoryQuery.safeParse({ q: typeof sp.q === "string" ? sp.q : undefined, severity: typeof sp.severity === "string" && sp.severity ? sp.severity : undefined });
  const filters = parsed.success ? parsed.data : {};
  let rows: AdvisoryRow[] = [];
  let failed = false;
  if (isConfigured()) {
    try {
      rows = await listAdvisories(await createClient(), filters);
    } catch {
      failed = true;
    }
  }

  return (
    <div className="shell section stack-lg">
      <header className="section-head">
        <span className="eyebrow">Verfy Advisories</span>
        <h1>Vulnerabilities in agent tooling</h1>
        <p className="lead">
          Public, sourced advisories for MCP servers and agent tools, in the OSV format with <code className="inline-code">ATLS-YYYY-NNNN</code> IDs and
          CVE aliases. Feed: <code className="inline-code">/api/v1/advisories</code>.
        </p>
      </header>

      {!isConfigured() && <NotConfigured />}
      {failed && <ErrorNote message="The advisories could not be loaded right now. Try again in a moment." />}

      <form className="glass card row" role="search" method="get" aria-label="Search advisories">
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label htmlFor="q">Search</label>
          <input id="q" name="q" className="input" defaultValue={filters.q ?? ""} placeholder="Package, ID or summary" maxLength={100} />
        </div>
        <div className="field" style={{ flex: "0 1 180px" }}>
          <label htmlFor="severity">Severity</label>
          <select id="severity" name="severity" className="select input" defaultValue={filters.severity ?? ""}>
            <option value="">Any</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end" }}>
          <Icon name="search" size={16} />
          <span>Search</span>
        </button>
      </form>

      {isConfigured() && !failed && rows.length === 0 && (
        <EmptyState icon="search" title="No advisories match" body="Try a different search or clear the filters." action={<Link href="/advisories" className="btn btn-secondary btn-sm"><span>Clear filters</span></Link>} />
      )}

      <div className="stack">
        {rows.map((a) => (
          <Link key={a.id} href={`/advisories/${a.id}`} className="glass card card-link stack" data-light style={{ gap: 8 }}>
            <div className="row">
              <span className={`badge badge-${a.severity}`}>{a.severity}</span>
              <code className="mono small">{a.id}</code>
              {a.aliases.map((al) => (
                <span key={al} className="badge">{al}</span>
              ))}
              {a.review_status === "unreviewed" && <span className="badge badge-unreviewed" title="Imported from a public source; not reproduced by Verfy">source: public record</span>}
            </div>
            <h2 style={{ fontSize: "1.08rem" }}>{a.summary}</h2>
            <p className="small muted">
              {a.ecosystem} · <span className="mono">{a.package}</span> · added <time dateTime={a.published}>{a.published.slice(0, 10)}</time>
            </p>
          </Link>
        ))}
      </div>

      <div className="alert alert-info">
        <Icon name="info" size={16} />
        <span>
          Entries marked &quot;source: public record&quot; come from public CVE records and were not independently reproduced by Verfy. New advisories are
          added by pull request with at least one public source; a submission portal is planned for a later phase.
        </span>
      </div>
    </div>
  );
}
