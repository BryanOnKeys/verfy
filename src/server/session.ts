import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { cache } from "react";
import { publicEnv } from "@/lib/env";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import { can, isRole, type Permission, type Role } from "@/core/permissions";
import { ApiError, assertSameOrigin } from "./http";

export interface SessionUser {
  id: string;
  email: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export const ORG_COOKIE = "verfy_org";

/**
 * The signed-in user, verified by Supabase (getClaims verifies the JWT).
 *
 * `mfaPending` is true when the user has turned on two-factor authentication but this session has only passed the
 * password step. Such a session may reach the code prompt and nothing else; the database enforces the same rule
 * (supabase/migrations/20261012000200_mfa.sql), so this is a convenience for routing, not the security boundary.
 */
export const getSessionUser = cache(async (): Promise<{ user: SessionUser | null; supabase: ServerSupabase; mfaPending: boolean }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { user: null, supabase, mfaPending: false };
  let mfaPending = false;
  if (claims.aal !== "aal2") {
    const res = await supabase.rpc("mfa_required");
    if (res.error) throw new ApiError(503, "unavailable", "Could not confirm your sign-in. Try again in a moment.");
    mfaPending = res.data === true;
  }
  return { user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" }, supabase, mfaPending };
});

export async function requireUser(nextPath = "/dashboard"): Promise<{ user: SessionUser; supabase: ServerSupabase }> {
  const { user, supabase, mfaPending } = await getSessionUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
  if (mfaPending) redirect(`/auth/mfa?next=${encodeURIComponent(nextPath)}`);
  return { user, supabase };
}

const MFA_REQUIRED = () => new ApiError(401, "mfa_required", "Finish two-factor sign-in first.");

export const listMyOrgs = cache(async (): Promise<OrgSummary[]> => {
  const { user, supabase, mfaPending } = await getSessionUser();
  if (!user || mfaPending) return [];
  const { data, error } = await supabase
    .from("memberships")
    .select("role, orgs!inner(id, name, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw new ApiError(503, "unavailable", "Could not load your organizations.");
  return (data ?? []).flatMap((m) => {
    const org = (Array.isArray(m.orgs) ? m.orgs[0] : m.orgs) as { id: string; name: string; slug: string } | undefined;
    return org && isRole(m.role) ? [{ ...org, role: m.role }] : [];
  });
});

/** The organization the dashboard is showing: the `verfy_org` cookie if it is one of the user's, else the first. */
export async function currentOrg(): Promise<OrgSummary | null> {
  const orgs = await listMyOrgs();
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  return orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
}

/** For API routes: a signed-in user who is a member of `orgId`, optionally with a permission. */
export async function requireOrgAccess(request: NextRequest, orgId: string, permission?: Permission, opts: { mutating?: boolean } = {}) {
  if (opts.mutating) assertSameOrigin(request, publicEnv().NEXT_PUBLIC_APP_URL);
  const { user, supabase, mfaPending } = await getSessionUser();
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in first.");
  if (mfaPending) throw MFA_REQUIRED();
  const orgs = await listMyOrgs();
  const org = orgs.find((o) => o.id === orgId);
  if (!org) throw new ApiError(404, "not_found", "Organization not found.");
  if (permission && !can(org.role, permission)) throw new ApiError(403, "forbidden", "Your role does not allow this.");
  return { user, supabase, org };
}

export async function requireSignedIn(request: NextRequest, opts: { mutating?: boolean } = {}) {
  if (opts.mutating) assertSameOrigin(request, publicEnv().NEXT_PUBLIC_APP_URL);
  const { user, supabase, mfaPending } = await getSessionUser();
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in first.");
  if (mfaPending) throw MFA_REQUIRED();
  return { user, supabase };
}
