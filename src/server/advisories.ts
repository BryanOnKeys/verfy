import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fromDbError } from "./http";

export const advisoryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  ecosystem: z.string().max(40).optional(),
});

export interface AdvisoryRow {
  id: string;
  summary: string;
  details: string;
  severity: "critical" | "high" | "medium" | "low";
  ecosystem: string | null;
  package: string | null;
  affected: unknown[];
  aliases: string[];
  references: { type?: string; url: string }[];
  published: string;
  modified: string;
  review_status: "unreviewed" | "reviewed";
}

/** Escape LIKE wildcards so a search term is matched literally. */
export function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

export async function listAdvisories(db: SupabaseClient, f: z.infer<typeof advisoryQuery>): Promise<AdvisoryRow[]> {
  let q = db
    .from("advisories")
    .select("id, summary, details, severity, ecosystem, package, affected, aliases, references, published, modified, review_status")
    .eq("status", "published")
    .order("modified", { ascending: false })
    .limit(200);
  if (f.severity) q = q.eq("severity", f.severity);
  if (f.ecosystem) q = q.eq("ecosystem", f.ecosystem);
  if (f.q) {
    const term = `%${likeLiteral(f.q)}%`;
    // .or() takes a PostgREST filter string; quote the value so commas or parentheses in the search cannot change the filter
    const quoted = `"${term.replace(/"/g, '\\"')}"`;
    q = q.or(`summary.ilike.${quoted},package.ilike.${quoted},id.ilike.${quoted}`);
  }
  const { data, error } = await q;
  if (error) throw fromDbError(error);
  return (data ?? []) as AdvisoryRow[];
}

export async function getAdvisory(db: SupabaseClient, id: string): Promise<AdvisoryRow | null> {
  if (!/^ATLS-\d{4}-\d{4,}$/.test(id)) return null;
  const { data, error } = await db
    .from("advisories")
    .select("id, summary, details, severity, ecosystem, package, affected, aliases, references, published, modified, review_status")
    .eq("status", "published")
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data as AdvisoryRow | null;
}
