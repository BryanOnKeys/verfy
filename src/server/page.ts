import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentOrg, requireUser, type OrgSummary, type SessionUser } from "./session";

/** For dashboard pages: a signed-in user with a current organization (else back to onboarding). */
export async function requirePageOrg(path: string): Promise<{ user: SessionUser; db: SupabaseClient; org: OrgSummary }> {
  const { user, supabase } = await requireUser(path);
  const org = await currentOrg();
  if (!org) redirect("/dashboard");
  return { user, db: supabase as unknown as SupabaseClient, org };
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const isDemoOrg = (org: OrgSummary) => /\(DEMO\)/.test(org.name);
