import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { listDevices, listReceipts, receiptFilters } from "@/server/data";
import { fmtDate, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Receipts" };

type SP = Record<string, string | string[] | undefined>;

function clean(sp: SP) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "") out[k] = v;
  // date inputs give YYYY-MM-DD; turn them into an inclusive UTC range
  if (out.from && /^\d{4}-\d{2}-\d{2}$/.test(out.from)) out.from = `${out.from}T00:00:00Z`;
  if (out.to && /^\d{4}-\d{2}-\d{2}$/.test(out.to)) out.to = new Date(Date.parse(`${out.to}T00:00:00Z`) + 86_400_000).toISOString();
  return out;
}

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, org } = await requirePageOrg("/dashboard/receipts");
  const sp = await searchParams;
  const parsed = receiptFilters.safeParse(clean(sp));
  const f = parsed.success ? parsed.data : receiptFilters.parse({});
  const [result, devices] = await Promise.all([listReceipts(db, org.id, f), listDevices(db, org.id)]);
  const pages = Math.max(1, Math.ceil(result.total / result.page_size));
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const k of ["verdict", "tool", "server", "device"] as const) if (f[k]) p.set(k, String(f[k]));
    if (typeof sp.from === "string" && sp.from) p.set("from", sp.from);
    if (typeof sp.to === "string" && sp.to) p.set("to", sp.to);
    p.set("page", String(page));
    return `?${p.toString()}`;
  };
  const filtered = Boolean(f.verdict || f.tool || f.server || f.device || f.from || f.to);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Receipts</h1>
          <p>Every allowed, asked and blocked action uploaded by your devices. Arguments are stored only as hashes unless a device opted in.</p>
        </div>
      </div>

      {!parsed.success && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={16} />
          <span>Some filters were not valid and were ignored.</span>
        </div>
      )}

      <form className="glass card filters" method="get" role="search" aria-label="Filter receipts" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="verdict">Verdict</label>
          <select id="verdict" name="verdict" className="select input" defaultValue={f.verdict ?? ""}>
            <option value="">Any</option>
            <option value="allow">Allow</option>
            <option value="ask">Ask</option>
            <option value="deny">Deny</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tool">Tool</label>
          <input id="tool" name="tool" className="input" defaultValue={f.tool ?? ""} placeholder="e.g. Bash" maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="device">Device</label>
          <select id="device" name="device" className="select input" defaultValue={f.device ?? ""}>
            <option value="">Any</option>
            {devices.map((d) => (
              <option key={d.id as string} value={d.id as string}>
                {d.name as string}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" name="from" type="date" className="input" defaultValue={typeof sp.from === "string" ? sp.from : ""} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="date" className="input" defaultValue={typeof sp.to === "string" ? sp.to : ""} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn-primary">
            <span>Apply</span>
          </button>
          {filtered && (
            <Link href="/dashboard/receipts" className="btn btn-ghost">
              <span>Clear</span>
            </Link>
          )}
        </div>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={filtered ? "No receipts match these filters" : "No receipts yet"}
          body={filtered ? "Widen the date range or clear a filter." : "Receipts appear after an enrolled device runs atls sync."}
          action={
            !filtered ? (
              <Link href="/dashboard/devices" className="btn btn-secondary btn-sm">
                <span>Enroll a device</span>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="glass" data-light>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Receipts, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Verdict</th>
                  <th scope="col">Server / tool</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Rules</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Device</th>
                  <th scope="col">Issued</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={`badge badge-${r.verdict}`}>{r.verdict}</span>
                    </td>
                    <td>
                      <Link className="row-link" href={`/dashboard/receipts/${r.id}`}>
                        {r.server ? `${r.server}/` : ""}
                        {r.tool}
                      </Link>
                    </td>
                    <td className="small text-2">{r.kind}</td>
                    <td className="small mono">{r.rules.slice(0, 2).join(", ") || "—"}{r.rules.length > 2 ? ` +${r.rules.length - 2}` : ""}</td>
                    <td className="small text-2">{r.outcome_status}</td>
                    <td className="small text-2">{r.devices?.name ?? "—"}</td>
                    <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                      {fmtDate(r.issued_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pager" aria-label="Pages">
            <span className="small muted">
              {result.total.toLocaleString("en-US")} receipts · page {result.page} of {pages}
            </span>
            <span className="row" style={{ gap: 6 }}>
              {result.page > 1 ? (
                <Link className="btn btn-secondary btn-sm" href={qs(result.page - 1)} rel="prev">
                  <span>Previous</span>
                </Link>
              ) : (
                <span className="btn btn-secondary btn-sm" aria-disabled="true">
                  <span>Previous</span>
                </span>
              )}
              {result.page < pages ? (
                <Link className="btn btn-secondary btn-sm" href={qs(result.page + 1)} rel="next">
                  <span>Next</span>
                </Link>
              ) : (
                <span className="btn btn-secondary btn-sm" aria-disabled="true">
                  <span>Next</span>
                </span>
              )}
            </span>
          </nav>
        </div>
      )}
    </>
  );
}
